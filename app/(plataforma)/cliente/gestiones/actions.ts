'use server';

import { requestChannel } from '@/lib/security/request';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zDate, zId, zMoney, zText } from '@/lib/actions';
import { zMaybeText, zOptPesos, zOptPct } from '@/lib/cliente/zod';
import { saveUpload } from '@/lib/domain/documents';
import { remainingSchedule, simulateStress } from '@/lib/finance';
import { dbDate, isoDay, todayBogota } from '@/lib/cliente/format';
import { clientAction, createServiceRequest, getUvrParams, loanStateOf, notifyStaff, ownPerson } from '@/lib/cliente/server';
import { notify } from '@/lib/jobs';
import { porcentaje } from '@/lib/formato';
import { money, REQUEST_KINDS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { sha256 } from '@/lib/security/crypto';
import { PAYMENT_CHANNELS } from './channels';

// ── (a) Reportar pago ─────────────────────────────────────────────────

const paymentSchema = z
  .object({
    loanId: zId,
    kind: z.enum(['INSTALLMENT', 'PREPAYMENT'], { error: 'Elige si es cuota o abono.' }),
    applyMode: z.preprocess((v) => (v ? v : undefined), z.enum(['TERM', 'PAYMENT']).optional()),
    paidOn: zDate,
    amount: zMoney.pipe(z.number().min(1_000, 'Indica el valor pagado.')),
    channel: z.enum(PAYMENT_CHANNELS as [string, ...string[]], { error: 'Elige el canal de pago.' }),
    reference: zMaybeText(80),
    file: z.instanceof(File, { message: 'Adjunta el soporte del pago.' }),
    ack: z.literal('on', { error: 'Confirma que entiendes que cargar el soporte no reemplaza el pago al banco.' }),
  })
  .refine((v) => v.kind !== 'PREPAYMENT' || v.applyMode, { message: 'Para un abono indica si lo aplicas a reducir plazo o cuota.', path: ['applyMode'] });

export const reportPaymentAction = secureAction('payment.report', paymentSchema, async (input, { session, meta }) => {
  if (input.paidOn > todayBogota()) throw new UserError('La fecha del pago no puede ser futura.');
  if (!(input.file instanceof File) || input.file.size === 0) throw new UserError('Adjunta el soporte del pago.');
  const reference = input.reference?.replace(/\s+/g, ' ').trim();
  const dedupeKey = sha256(`${input.loanId}|${input.paidOn}|${input.amount}|${(reference ?? '').toUpperCase()}`);
  const prisma = getPrisma();
  const report = await prisma.$transaction(
    async (tx) => {
      const person = await ownPerson(session, tx);
      const loan = await tx.loan.findFirst({ where: { id: input.loanId, personId: person.id, active: true } });
      if (!loan) throw new UserError('Crédito no encontrado.');
      if (input.paidOn < isoDay(loan.disbursedAt)) throw new UserError('La fecha del pago es anterior al desembolso del crédito.');
      const duplicate = await tx.paymentReport.findFirst({ where: { dedupeKey, status: { not: 'REJECTED' } }, select: { id: true, status: true } });
      if (duplicate) throw new UserError('Ya reportaste un pago con la misma fecha, valor y referencia. Si es otro pago, revisa la referencia.');
      const type = await tx.documentType.findUnique({ where: { code: 'SOPORTE_PAGO' } });
      if (!type) throw new UserError('No podemos recibir soportes en este momento. Escríbenos a contacto@viis.app.');
      const document = await saveUpload(tx, { file: input.file, personId: person.id, typeId: type.id }, { actor: session.user, meta });
      const created = await tx.paymentReport.create({
        data: {
          loanId: loan.id,
          kind: input.kind,
          applyMode: input.kind === 'PREPAYMENT' ? input.applyMode : null,
          paidOn: dbDate(input.paidOn),
          amount: BigInt(input.amount),
          channel: input.channel,
          reference: reference ?? null,
          documentId: document.id,
          reportedById: session.user.id,
          dedupeKey,
        },
      });
      await audit(
        {
          actorId: session.user.id,
          actorRole: session.user.role,
          action: 'payment.reported',
          entity: 'PaymentReport',
          entityId: created.id,
          after: { loanId: loan.id, kind: input.kind, applyMode: created.applyMode, paidOn: input.paidOn, amount: input.amount, channel: input.channel, documentId: document.id },
          ipHash: meta.ipHash,
        },
        tx,
      );
      await notifyStaff(tx, {
        title: `Pago reportado · ${input.kind === 'PREPAYMENT' ? 'abono' : 'cuota'} ${money(input.amount)}`,
        body: `${person.firstName} ${person.lastName} reportó un pago del ${input.paidOn} (${input.channel}).`,
        href: '/empresa/pagos',
      });
      return created;
    },
    { timeout: 60_000 },
  );
  revalidatePath('/cliente', 'layout');
  return ok(
    `Pago de ${money(report.amount)} reportado. Quedó en estado "Reportado" hasta que operación lo compare con tu extracto. Recuerda: el soporte no reemplaza el pago al banco.`,
  );
});

// ── (b) Solicitudes ───────────────────────────────────────────────────

const requestSchema = z.object({
  kind: z.enum(Object.keys(REQUEST_KINDS) as [string, ...string[]], { error: 'Elige el tipo de solicitud.' }),
  subject: zText(200, 4, 'Escribe un asunto corto.'),
  detail: zText(4000, 10, 'Cuéntanos un poco más (al menos 10 caracteres).'),
  incomeDrop: zOptPct,
  newExpense: zOptPesos,
});

const ALERT_TEXT: Record<string, string> = { OK: 'resiste el escenario', VIGILAR: 'vigilar', RIESGO: 'riesgo alto' };

/** Resumen del Modo Tranquilidad calculado en el servidor, para que el equipo lo vea con la solicitud. */
async function hardshipSummary(personId: string, incomeDrop: number, newExpense: number): Promise<string | null> {
  const prisma = getPrisma();
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  if (person.monthlyIncome === null || person.monthlyExpenses === null) return 'Modo Tranquilidad: el cliente no ha registrado ingresos y gastos.';
  const loans = await prisma.loan.findMany({ where: { personId, active: true } });
  const params = await getUvrParams();
  let payment = 0;
  for (const loan of loans) {
    const { state } = loanStateOf(loan, params);
    if (!state) continue;
    try {
      payment += remainingSchedule(state).basePayment;
    } catch {
      // crédito con datos incompletos: no suma
    }
  }
  const r = simulateStress({
    monthlyIncome: toNumber(person.monthlyIncome),
    monthlyExpenses: toNumber(person.monthlyExpenses),
    payment,
    savings: toNumber(person.savings),
    incomeDropPct: incomeDrop,
    newExpense,
  }).results;
  return `Modo Tranquilidad (motor OpenV, datos declarados): caída de ingreso ${Math.round(incomeDrop * 100)} %, gasto nuevo ${money(newExpense)}, cuota estimada ${money(payment)}. Alerta: ${ALERT_TEXT[r.alert]}. Margen mensual: ${money(r.monthlyMargin)}.${r.coverageMonths !== null ? ` El ahorro cubre ${porcentaje(r.coverageMonths, 1)} meses de déficit.` : ''}`;
}

export const createRequestAction = secureAction('request.create', requestSchema, async (input, { session, meta }) => {
  const person = await ownPerson(session);
  const recent = await getPrisma().serviceRequest.count({ where: { personId: person.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 10) throw new UserError('Has creado muchas solicitudes en la última hora. Espera un momento o escribe a contacto@viis.app.');
  let detail = input.detail;
  if (input.kind === 'HARDSHIP') {
    const summary = await hardshipSummary(person.id, input.incomeDrop ?? 0, input.newExpense ?? 0);
    if (summary) detail = `${detail}\n\n${summary}`;
  }
  const { code } = await getPrisma().$transaction((tx) => createServiceRequest(tx, { personId: person.id, kind: input.kind, subject: input.subject, detail }, { session, meta }));
  revalidatePath('/cliente', 'layout');
  const sla = REQUEST_KINDS[input.kind].slaHours;
  return ok(`Solicitud ${code} creada. Te responderemos en máximo ${sla >= 48 ? `${Math.round(sla / 24)} días` : `${sla} horas`}; te avisamos por correo y en la campana.`);
});

export const replyRequestAction = secureAction(
  'request.create',
  z.object({ requestId: zId, body: zText(4000, 2, 'Escribe tu mensaje.') }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const person = await ownPerson(session, tx);
      const request = await tx.serviceRequest.findFirst({ where: { id: input.requestId, personId: person.id } });
      if (!request) throw new UserError('Solicitud no encontrada.');
      if (request.status === 'RESOLVED' || request.status === 'REJECTED') {
        throw new UserError('Esta solicitud está cerrada. Si necesitas algo más, crea una nueva.');
      }
      const message = await tx.requestMessage.create({ data: { requestId: request.id, byUserId: session.user.id, body: input.body, internal: false } });
      if (request.status === 'WAITING_CLIENT') await tx.serviceRequest.update({ where: { id: request.id }, data: { status: 'IN_PROGRESS' } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'request.message', entity: 'ServiceRequest', entityId: request.id, after: { messageId: message.id }, ipHash: meta.ipHash }, tx);
      const title = `${request.code}: nuevo mensaje del cliente`;
      if (request.assigneeId) await notify({ userId: request.assigneeId, title, body: request.subject, href: `/empresa/solicitudes/${request.id}` }, tx);
      else await notifyStaff(tx, { title, body: request.subject, href: `/empresa/solicitudes/${request.id}` });
    });
    revalidatePath('/cliente/gestiones');
    return ok('Mensaje enviado.');
  },
);

// ── (c) Ofertas ───────────────────────────────────────────────────────

export const acceptOfferAction = clientAction(
  z.object({ offerId: zId, confirm: z.literal('on', { error: 'Confirma que leíste las condiciones.' }) }),
  async (input, { session, meta, person }) => {
    const code = await getPrisma().$transaction(async (tx) => {
      const offer = await tx.offer.findFirst({
        where: { id: input.offerId, opportunity: { personId: person.id } },
        include: { opportunity: { select: { id: true, code: true, stage: true, assigneeId: true } } },
      });
      if (!offer) throw new UserError('Oferta no encontrada.');
      if (offer.acceptedAt) throw new UserError('Esta oferta ya fue aceptada.');
      if (offer.opportunity.stage === 'WITHDRAWN') throw new UserError('El caso está cerrado.');
      if (offer.validUntil && isoDay(offer.validUntil) < todayBogota()) throw new UserError('La oferta venció. Pide a tu asesor una actualizada.');
      const other = await tx.offer.findFirst({ where: { opportunityId: offer.opportunityId, acceptedAt: { not: null } }, select: { id: true } });
      if (other) throw new UserError('Ya aceptaste otra oferta en este caso. Si quieres cambiarla, habla con tu asesor.');
      const acceptedAt = new Date();
      // Evidencia: exactamente lo que el cliente tenía en pantalla al aceptar.
      const evidence = {
        shown: {
          entityName: offer.entityName,
          rateEa: offer.rateEa.toString(),
          system: offer.system,
          termMonths: offer.termMonths,
          amount: offer.amount.toString(),
          monthlyInsurance: offer.monthlyInsurance.toString(),
          upfrontCosts: offer.upfrontCosts.toString(),
          conditions: offer.conditions,
          validUntil: offer.validUntil ? isoDay(offer.validUntil) : null,
          source: offer.source,
          results: offer.results,
          engineVersion: offer.engineVersion,
          offerCreatedAt: offer.createdAt.toISOString(),
        },
        acceptedAt: acceptedAt.toISOString(),
        channel: `${await requestChannel()}_cliente`,
        ipHash: meta.ipHash ?? null,
        userAgent: meta.userAgent ?? null,
        statement: 'Leí las condiciones, supuestos y advertencias, y acepto continuar con esta oferta. Entiendo que la aprobación y condiciones definitivas las fija la entidad.',
      };
      const updated = await tx.offer.updateMany({ where: { id: offer.id, acceptedAt: null }, data: { acceptedAt, acceptedById: session.user.id, acceptEvidence: evidence } });
      if (updated.count !== 1) throw new UserError('Esta oferta ya fue aceptada.');
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'offer.accepted', entity: 'Offer', entityId: offer.id, after: evidence, ipHash: meta.ipHash }, tx);
      const title = `${offer.opportunity.code}: el cliente aceptó la oferta de ${offer.entityName}`;
      if (offer.opportunity.assigneeId) await notify({ userId: offer.opportunity.assigneeId, title, body: `Aceptada el ${acceptedAt.toISOString().slice(0, 10)}.`, href: `/empresa/casos/${offer.opportunity.id}` }, tx);
      else await notifyStaff(tx, { title, body: 'Revisa el caso para continuar.', href: `/empresa/casos/${offer.opportunity.id}` });
      return offer.opportunity.code;
    });
    revalidatePath('/cliente', 'layout');
    return ok(`Registramos tu aceptación en el caso ${code}. Tu asesor te indicará los siguientes pasos para la firma.`);
  },
);
