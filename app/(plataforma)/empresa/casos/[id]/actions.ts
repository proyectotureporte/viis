'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import { ok, secureAction, UserError, zDate, zId, zMoney, zOptMoney, zOptText, zPercent, zText } from '@/lib/actions';
import { changeStage } from '@/lib/domain/cases';
import { saveUpload } from '@/lib/domain/documents';
import { assertActiveStaff, assertCaseInScope } from '@/lib/empresa/access';
import { assignCase, escalateCase, setPriority } from '@/lib/empresa/cases';
import { decideDocument, takeDocument } from '@/lib/empresa/documents';
import { computeOffer, latestUvrParams } from '@/lib/empresa/finance';
import { dbDate, todayBogota } from '@/lib/empresa/params';
import { notify } from '@/lib/jobs';
import { DOCUMENT_TYPES_ID, fechaHora, money, STAGES } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { decryptText } from '@/lib/security/crypto';

const path = (id: string) => `/empresa/casos/${id}`;

// ── Datos sensibles ─────────────────────────────────────────────────────

/** Descifra documento y teléfono SOLO a pedido y deja la consulta en la bitácora. */
export const revealPersonAction = secureAction('person.read', z.object({ opportunityId: zId }), async (input, { session, meta }) => {
  const prisma = getPrisma();
  await assertCaseInScope(session, input.opportunityId);
  const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { person: { select: { id: true, documentType: true, documentNumEnc: true, phoneEnc: true } } } });
  const person = opp.person;
  const number = decryptText(person.documentNumEnc);
  const phone = person.phoneEnc ? decryptText(person.phoneEnc) : null;
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'person.document_viewed', entity: 'Person', entityId: person.id, after: { fields: phone ? ['documento', 'teléfono'] : ['documento'], opportunityId: input.opportunityId }, ipHash: meta.ipHash });
  return ok(`${DOCUMENT_TYPES_ID[person.documentType] ?? person.documentType}: ${number}${phone ? ` · Teléfono: ${phone}` : ''} (consulta registrada en la bitácora)`);
});

// ── Etapa, prioridad, responsable, entidad ──────────────────────────────

export const changeStageAction = secureAction(
  'case.stage',
  z.object({
    opportunityId: zId,
    to: z.enum(STAGES as [string, ...string[]], { error: 'Elige la etapa destino.' }),
    note: zOptText(500),
    disbursedAmount: zOptMoney,
    withdrawReason: zOptText(240),
  }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      await changeStage(
        tx,
        {
          opportunityId: input.opportunityId,
          to: input.to as (typeof STAGES)[number],
          note: input.note,
          disbursedAmount: input.to === 'DISBURSED' ? input.disbursedAmount : undefined,
          withdrawReason: input.to === 'WITHDRAWN' ? input.withdrawReason : undefined,
        },
        { actor: session.user, meta },
      );
    });
    revalidatePath(path(input.opportunityId));
    return ok('Etapa actualizada y partes notificadas.');
  },
);

export const setPriorityAction = secureAction(
  'case.assign',
  z.object({ opportunityId: zId, priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      await setPriority(tx, input.opportunityId, input.priority, { actor: session.user, meta });
    });
    revalidatePath(path(input.opportunityId));
    return ok('Prioridad actualizada.');
  },
);

export const assignAction = secureAction(
  'case.assign',
  z.object({ opportunityId: zId, assigneeId: z.union([zId, z.literal('')]) }),
  async (input, { session, meta }) => {
    const changed = await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      return assignCase(tx, input.opportunityId, input.assigneeId || null, { actor: session.user, meta });
    });
    revalidatePath(path(input.opportunityId));
    return ok(changed ? 'Responsable actualizado.' : 'El caso ya tenía ese responsable.');
  },
);

export const setEntityAction = secureAction(
  'case.stage',
  z.object({ opportunityId: zId, entityId: z.union([zId, z.literal('')]) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { entityId: true } });
      const entityId = input.entityId || null;
      if (entityId) {
        const entity = await tx.entity.findFirst({ where: { id: entityId, active: true }, select: { id: true } });
        if (!entity) throw new UserError('La entidad elegida no está activa.');
      }
      if (opp.entityId === entityId) return;
      await tx.opportunity.update({ where: { id: input.opportunityId }, data: { entityId } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'case.entity_changed', entity: 'Opportunity', entityId: input.opportunityId, before: { entityId: opp.entityId }, after: { entityId }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath(path(input.opportunityId));
    return ok('Entidad financiera actualizada.');
  },
);

export const nextActionAction = secureAction(
  'case.note',
  z.object({ opportunityId: zId, nextAction: zText(240, 3, 'Describe la siguiente acción.') }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { nextAction: true } });
      await tx.opportunity.update({ where: { id: input.opportunityId }, data: { nextAction: input.nextAction } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'case.next_action_changed', entity: 'Opportunity', entityId: input.opportunityId, before: { nextAction: opp.nextAction }, after: { nextAction: input.nextAction }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath(path(input.opportunityId));
    return ok('Siguiente acción guardada.');
  },
);

export const escalateAction = secureAction(
  'case.stage',
  z.object({ opportunityId: zId, reason: zText(300, 5, 'Explica por qué escalas el caso (mínimo 5 caracteres).') }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      await escalateCase(tx, input.opportunityId, input.reason, { actor: session.user, meta });
    });
    revalidatePath(path(input.opportunityId));
    return ok('Caso escalado. Coordinación fue notificada.');
  },
);

// ── Documentos ──────────────────────────────────────────────────────────

async function assertDocOfCase(tx: Prisma.TransactionClient, documentId: string, opportunityId: string) {
  const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, select: { personId: true } });
  const doc = await tx.document.findFirst({ where: { id: documentId, personId: opp.personId }, select: { id: true } });
  if (!doc) throw new UserError('El documento no pertenece a este expediente.');
}

export const takeDocAction = secureAction('doc.review', z.object({ opportunityId: zId, documentId: zId }), async (input, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    await assertCaseInScope(session, input.opportunityId, tx);
    await assertDocOfCase(tx, input.documentId, input.opportunityId);
    await takeDocument(tx, input.documentId, { actor: session.user, meta });
  });
  revalidatePath(path(input.opportunityId));
  return ok('Documento en revisión a tu nombre.');
});

export const decideDocAction = secureAction(
  'doc.review',
  z.object({ opportunityId: zId, documentId: zId, decision: z.enum(['APPROVE', 'REJECT']), reason: zOptText(500) }),
  async (input, { session, meta }) => {
    const result = await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      await assertDocOfCase(tx, input.documentId, input.opportunityId);
      return decideDocument(tx, input, { actor: session.user, meta });
    });
    revalidatePath(path(input.opportunityId));
    return ok(result.status === 'APPROVED' ? 'Documento aprobado. Notificamos al cliente.' : 'Documento rechazado con motivo. Notificamos al cliente.');
  },
);

export const uploadDocAction = secureAction(
  'doc.upload',
  z.object({ opportunityId: zId, typeId: zId, file: z.instanceof(File, { message: 'Adjunta un archivo.' }) }),
  async (input, { session, meta }) => {
    const doc = await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { personId: true } });
      return saveUpload(tx, { file: input.file, personId: opp.personId, typeId: input.typeId, opportunityId: input.opportunityId }, { actor: session.user, meta });
    }, { timeout: 60_000 });
    revalidatePath(path(input.opportunityId));
    return ok(doc.status === 'QUARANTINED' ? 'Archivo guardado en verificación antivirus; se habilitará al terminar el escaneo.' : `Documento cargado (versión ${doc.version}).`);
  },
);

// ── Interacciones y tareas ──────────────────────────────────────────────

export const addInteractionAction = secureAction(
  'case.note',
  z.object({
    opportunityId: zId,
    channel: z.enum(['LLAMADA', 'WHATSAPP', 'CORREO', 'REUNION', 'INTERNO']),
    summary: zText(4000, 3, 'Escribe el resumen.'),
    visibleToClient: z.union([z.literal('on'), z.undefined()]).transform((v) => v === 'on'),
  }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { code: true, person: { select: { user: { select: { id: true, active: true } } } } } });
      const interaction = await tx.interaction.create({ data: { opportunityId: input.opportunityId, channel: input.channel, summary: input.summary, visibleToClient: input.visibleToClient, byUserId: session.user.id } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'case.interaction_added', entity: 'Opportunity', entityId: input.opportunityId, after: { interactionId: interaction.id, channel: input.channel, visibleToClient: input.visibleToClient }, ipHash: meta.ipHash }, tx);
      if (input.visibleToClient && opp.person.user?.active) {
        await notify({ userId: opp.person.user.id, title: `Novedad en tu caso ${opp.code}`, body: input.summary.slice(0, 500), href: '/cliente/gestiones' }, tx);
      }
    });
    revalidatePath(path(input.opportunityId));
    return ok(input.visibleToClient ? 'Nota guardada y compartida con el cliente.' : 'Nota interna guardada.');
  },
);

export const createTaskAction = secureAction(
  'case.note',
  z.object({
    opportunityId: zId,
    assigneeId: zId,
    kind: z.enum(['TAREA', 'LLAMADA', 'CITA', 'SEGUIMIENTO']),
    title: zText(200, 3, 'Escribe el título de la tarea.'),
    detail: zOptText(2000),
    dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indica fecha y hora de vencimiento.'),
  }),
  async (input, { session, meta }) => {
    const dueAt = new Date(`${input.dueAt}:00-05:00`);
    if (Number.isNaN(dueAt.getTime())) throw new UserError('Fecha de vencimiento inválida.');
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const assignee = await assertActiveStaff(input.assigneeId, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { code: true } });
      const task = await tx.task.create({ data: { opportunityId: input.opportunityId, assigneeId: assignee.id, kind: input.kind, title: input.title, detail: input.detail, dueAt, createdById: session.user.id } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'task.created', entity: 'Opportunity', entityId: input.opportunityId, after: { taskId: task.id, assigneeId: assignee.id, title: input.title, dueAt: dueAt.toISOString() }, ipHash: meta.ipHash }, tx);
      if (assignee.id !== session.user.id) {
        await notify({ userId: assignee.id, title: `Nueva tarea · ${opp.code}`, body: `${input.title} · vence ${fechaHora(dueAt)}`, href: path(input.opportunityId) }, tx);
      }
    });
    revalidatePath(path(input.opportunityId));
    return ok('Tarea creada.');
  },
);

export const updateTaskAction = secureAction(
  'case.note',
  z.object({ opportunityId: zId, taskId: zId, status: z.enum(['DONE', 'CANCELLED']) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const task = await tx.task.findFirst({ where: { id: input.taskId, opportunityId: input.opportunityId } });
      if (!task) throw new UserError('La tarea no pertenece a este caso.');
      if (task.status !== 'OPEN') throw new UserError('La tarea ya estaba cerrada.');
      await tx.task.update({ where: { id: task.id }, data: { status: input.status, doneAt: new Date() } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: input.status === 'DONE' ? 'task.done' : 'task.cancelled', entity: 'Opportunity', entityId: input.opportunityId, before: { taskId: task.id, status: task.status }, after: { taskId: task.id, status: input.status }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath(path(input.opportunityId));
    return ok(input.status === 'DONE' ? 'Tarea completada.' : 'Tarea cancelada.');
  },
);

// ── Ofertas ─────────────────────────────────────────────────────────────

export const createOfferAction = secureAction(
  'offer.manage',
  z.object({
    opportunityId: zId,
    entityName: zOptText(120),
    entityOther: zOptText(120),
    rateEa: zPercent.refine((v) => v > 0 && v < 0.6, 'La tasa EA debe estar entre 0 % y 60 %.'),
    system: z.enum(['FIXED_PESOS', 'UVR']),
    termMonths: z.coerce.number().int('El plazo debe ser entero.').min(12, 'Plazo mínimo 12 meses.').max(360, 'Plazo máximo 360 meses.'),
    amount: zMoney.refine((v) => v >= 1_000_000, 'Indica el monto de la oferta.'),
    monthlyInsurance: zOptMoney,
    upfrontCosts: zOptMoney,
    conditions: zOptText(2000),
    validUntil: z.union([zDate, z.literal('')]).optional(),
    source: zText(200, 3, 'Indica la fuente de la oferta (p. ej. "Oferta escrita Banco X del 20-sep").'),
  }),
  async (input, { session, meta }) => {
    const entityName = input.entityOther || input.entityName;
    if (!entityName) throw new UserError('Elige o escribe la entidad de la oferta.');
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { id: true, code: true, personId: true, allyUserId: true, stage: true, person: { select: { user: { select: { id: true, active: true } } } } } });
      if (['WITHDRAWN', 'POSTSALE'].includes(opp.stage)) throw new UserError('El caso está cerrado; no se pueden registrar ofertas.');
      const [uvr, currentLoan] = await Promise.all([
        latestUvrParams(tx),
        tx.loan.findFirst({ where: { personId: opp.personId, active: true }, orderBy: { createdAt: 'desc' } }),
      ]);
      const results = computeOffer(
        { amount: input.amount, rateEa: input.rateEa, termMonths: input.termMonths, system: input.system, monthlyInsurance: input.monthlyInsurance ?? 0, upfrontCosts: input.upfrontCosts ?? 0 },
        { uvr, currentLoan },
      );
      const offer = await tx.offer.create({
        data: {
          opportunityId: opp.id,
          entityName,
          rateEa: input.rateEa.toFixed(6),
          system: input.system,
          termMonths: input.termMonths,
          amount: BigInt(input.amount),
          monthlyInsurance: BigInt(input.monthlyInsurance ?? 0),
          upfrontCosts: BigInt(input.upfrontCosts ?? 0),
          conditions: input.conditions,
          validUntil: input.validUntil ? dbDate(input.validUntil) : null,
          source: input.source,
          results: results as unknown as Prisma.InputJsonValue,
          engineVersion: results.engineVersion,
          createdById: session.user.id,
        },
      });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'offer.created', entity: 'Offer', entityId: offer.id, after: { opportunityId: opp.id, entityName, rateEa: input.rateEa, termMonths: input.termMonths, amount: input.amount, source: input.source, payment: results.payment, totalCost: results.totalCost, engineVersion: results.engineVersion }, ipHash: meta.ipHash }, tx);
      if (opp.person.user?.active) {
        await notify({ userId: opp.person.user.id, title: `Nueva alternativa en tu caso ${opp.code}`, body: `${entityName}: cuota estimada ${money(results.payment)} a ${input.termMonths} meses. Tu asesor te explicará supuestos y costos antes de decidir.`, href: '/cliente/gestiones' }, tx);
      }
      if (opp.allyUserId && opp.allyUserId !== session.user.id) {
        await notify({ userId: opp.allyUserId, title: `${opp.code} · nueva oferta registrada`, body: `${entityName} · cuota ${money(results.payment)} · costo total ${money(results.totalCost)}`, href: `/aliado/clientes/${opp.id}` }, tx);
      }
    });
    revalidatePath(path(input.opportunityId));
    return ok('Oferta registrada y calculada con el motor.');
  },
);

export const acceptOfferAction = secureAction(
  'offer.manage',
  z.object({
    opportunityId: zId,
    offerId: zId,
    channel: z.enum(['PRESENCIAL', 'LLAMADA', 'VIDEOLLAMADA', 'CORREO', 'WHATSAPP']),
    declaration: zText(1000, 10, 'Describe cómo el cliente aceptó (mínimo 10 caracteres).'),
  }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      await assertCaseInScope(session, input.opportunityId, tx);
      const offer = await tx.offer.findFirst({ where: { id: input.offerId, opportunityId: input.opportunityId } });
      if (!offer) throw new UserError('La oferta no pertenece a este caso.');
      const already = await tx.offer.findFirst({ where: { opportunityId: input.opportunityId, acceptedAt: { not: null } }, select: { id: true } });
      if (already) throw new UserError('Este caso ya tiene una oferta aceptada.');
      if (offer.validUntil && offer.validUntil.toISOString().slice(0, 10) < todayBogota()) throw new UserError('La oferta está vencida; registra una nueva vigente.');
      const evidence = { channel: input.channel, declaration: input.declaration, registeredBy: session.user.id, registeredAt: new Date().toISOString(), resultsSeen: offer.results, engineVersion: offer.engineVersion };
      await tx.offer.update({ where: { id: offer.id }, data: { acceptedAt: new Date(), acceptedById: session.user.id, acceptEvidence: evidence as Prisma.InputJsonValue } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'offer.accepted', entity: 'Offer', entityId: offer.id, after: { opportunityId: input.opportunityId, channel: input.channel, declaration: input.declaration }, ipHash: meta.ipHash }, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, select: { code: true, allyUserId: true, person: { select: { user: { select: { id: true, active: true, email: true } } } } } });
      if (opp.person.user?.active) {
        await notify({ userId: opp.person.user.id, title: `Registramos tu aceptación · ${opp.code}`, body: `Aceptaste la alternativa de ${offer.entityName}. Si no reconoces esta decisión, escríbenos de inmediato.`, href: '/cliente/gestiones', email: { to: opp.person.user.email } }, tx);
      }
      if (opp.allyUserId && opp.allyUserId !== session.user.id) {
        await notify({ userId: opp.allyUserId, title: `${opp.code} · oferta aceptada`, body: `El cliente aceptó la alternativa de ${offer.entityName}.`, href: `/aliado/clientes/${input.opportunityId}` }, tx);
      }
    });
    revalidatePath(path(input.opportunityId));
    return ok('Aceptación registrada con evidencia.');
  },
);
