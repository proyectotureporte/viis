'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, ok, UserError, zCheckbox, zId, zOptMoney, zOptText, zText } from '@/lib/actions';
import { allyAction, okWithLink, personName, scopedCase } from '@/lib/aliado/scope';
import { CONSENT_PURPOSES, consentRecords, normalizeDocument } from '@/lib/consent';
import { changeStage, createOpportunity, findOrCreatePerson } from '@/lib/domain/cases';
import { saveUpload } from '@/lib/domain/documents';
import { enqueueEmail, notify } from '@/lib/jobs';
import { PRODUCTS, STAGE_LABELS } from '@/lib/labels';
import { appUrl } from '@/lib/mail';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { blindIndex, decryptText } from '@/lib/security/crypto';
import { recordAttempt, tooManyAttempts } from '@/lib/security/ratelimit';
import type { SessionUser } from '@/lib/security/session';
import type { Prisma } from '@/app/generated/prisma/client';

type Tx = Prisma.TransactionClient;

const PRODUCT_CODES = Object.keys(PRODUCTS) as [string, ...string[]];
const CONSENT_CODES = CONSENT_PURPOSES.map((p) => p.code) as [string, ...string[]];
const DOC_TYPES = ['CC', 'CE', 'PPT', 'PA'] as const;
const TX = { timeout: 30_000, maxWait: 10_000 };
const INVITE_COOLDOWN_MS = 24 * 3_600_000;

const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .optional()
  .transform((v) => v || undefined)
  .pipe(z.email('Correo electrónico inválido.').optional());

const zCodes = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(z.array(z.enum(CONSENT_CODES, 'Autorización desconocida.')));

type InviteResult = 'sent' | 'has_account' | 'recent';

async function inviteToRegister(tx: Tx, input: { personId: string; email: string; firstName: string; actor: SessionUser; allyName: string; ipHash?: string }): Promise<InviteResult> {
  const hasAccount = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (hasAccount) return 'has_account';
  const recent = await tx.auditEvent.findFirst({
    where: { action: 'person.invited', entity: 'Person', entityId: input.personId, at: { gt: new Date(Date.now() - INVITE_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return 'recent';
  await enqueueEmail(
    {
      to: input.email,
      subject: 'Sigue tu crédito de vivienda en OpenV',
      title: `Hola ${input.firstName}, tu caso ya está en OpenV`,
      paragraphs: [
        `${input.allyName} registró tu solicitud en OpenV con tu autorización.`,
        'Crea tu cuenta para ver en qué etapa va, qué documentos faltan y cargarlos de forma segura. Usa el mismo documento de identidad para que tu expediente quede vinculado.',
        'Si no reconoces esta solicitud, escríbenos a contacto@viis.app.',
      ],
      cta: { label: 'Crear mi cuenta', href: appUrl('/registro') },
    },
    tx,
  );
  await audit({ actorId: input.actor.id, actorRole: input.actor.role, action: 'person.invited', entity: 'Person', entityId: input.personId, ipHash: input.ipHash }, tx);
  return 'sent';
}

// ── Alta de cliente + caso (P0: sin duplicar y con consentimiento) ───────

const createSchema = z.object({
  documentType: z.enum(DOC_TYPES, 'Elige el tipo de documento.'),
  documentNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^0-9A-Za-z]/g, '').toUpperCase())
    .pipe(z.string().min(5, 'Número de documento inválido.').max(20, 'Número de documento inválido.')),
  firstName: zText(120, 1, 'Escribe los nombres del cliente.'),
  lastName: zText(120, 1, 'Escribe los apellidos del cliente.'),
  email: zEmail,
  phone: zOptText(30).pipe(z.string().regex(/^[+\d][\d\s()-]{6,}$/, 'Celular inválido.').optional()),
  city: zOptText(120),
  monthlyIncome: zOptMoney,
  product: z.enum(PRODUCT_CODES, 'Elige el producto.'),
  amount: zOptMoney,
  consents: zCodes,
  declaration: zCheckbox,
  invite: zCheckbox,
});

export const createClientAction = allyAction('case.create', createSchema, async (input, { session, meta, orgId }) => {
  const { user } = session;
  if (!input.consents.includes('TRATAMIENTO')) return fail('La autorización de tratamiento de datos es obligatoria para registrar al cliente.');
  if (!input.declaration) return fail('Confirma que el cliente te autorizó expresamente y que conservas la evidencia.');

  const conflictKey = `ally.ownership:${user.id}`;
  if (await tooManyAttempts([conflictKey], 10, 24 * 3_600_000)) {
    return fail('Tuviste varios intentos con clientes protegidos por otros aliados. Por seguridad, espera hasta mañana o escribe a contacto@viis.app.');
  }

  const prisma = getPrisma();
  // Regla de titularidad verificada antes de la transacción para que el intento quede auditado.
  const documentIndex = blindIndex('doc', normalizeDocument(input.documentType, input.documentNumber));
  const existing = await prisma.person.findUnique({ where: { documentIndex }, select: { id: true, ownerAllyOrgId: true, ownerUntil: true } });
  if (existing?.ownerAllyOrgId && existing.ownerAllyOrgId !== orgId && existing.ownerUntil && existing.ownerUntil > new Date()) {
    await audit({ actorId: user.id, actorRole: user.role, action: 'person.ownership_conflict', entity: 'Person', entityId: existing.id, ipHash: meta.ipHash });
    await recordAttempt([conflictKey], false);
    return fail('Este cliente ya está registrado y protegido por otro aliado. Si crees que es un error, escribe a contacto@viis.app.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
    const { personId, created } = await findOrCreatePerson(
      tx,
      {
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        city: input.city,
        monthlyIncome: input.monthlyIncome,
      },
      { actor: user, allyOrgId: orgId, consents: input.consents, meta },
    );
    const opportunity = await createOpportunity(
      tx,
      { personId, product: input.product, amount: input.amount, channel: 'ALIADO', allyOrgId: orgId, allyUserId: user.id },
      { actor: user, meta },
    );
    await audit(
      {
        actorId: user.id,
        actorRole: user.role,
        action: 'case.ally_registered',
        entity: 'Opportunity',
        entityId: opportunity.id,
        after: { personCreated: created, consents: input.consents, allyDeclaration: true, allyOrgId: orgId },
        ipHash: meta.ipHash,
      },
      tx,
    );

    const person = await tx.person.findUniqueOrThrow({ where: { id: personId }, include: { user: { select: { id: true, email: true, active: true } } } });
    if (person.user?.active) {
      await notify(
        {
          userId: person.user.id,
          title: `Abrimos tu caso ${opportunity.code}`,
          body: `${org.name}, aliado de OpenV, registró tu solicitud de ${PRODUCTS[input.product].toLowerCase()}. Aquí verás su avance y los documentos que falten.`,
          href: '/cliente/gestiones',
          email: { to: person.user.email },
        },
        tx,
      );
    }
    const coordinators = await tx.user.findMany({ where: { role: 'COORDINATOR', active: true }, select: { id: true } });
    for (const coordinator of coordinators) {
      await notify(
        {
          userId: coordinator.id,
          title: `Nuevo caso de aliado · ${opportunity.code}`,
          body: `${org.name} registró ${PRODUCTS[input.product].toLowerCase()} para ${personName(person)}. Pendiente de asignar.`,
          href: `/empresa/bandeja?q=${opportunity.code}`,
        },
        tx,
      );
    }

    let invited = false;
    const email = person.email ?? input.email;
    if (input.invite && email && !person.userId) {
      invited = (await inviteToRegister(tx, { personId, email, firstName: person.firstName, actor: user, allyName: org.name, ipHash: meta.ipHash })) === 'sent';
    }
    return { ...opportunity, created, invited };
  }, TX);

  revalidatePath('/aliado', 'layout');
  const parts = [
    `Caso ${result.code} creado.`,
    result.created ? 'Registramos al cliente con sus autorizaciones.' : 'El cliente ya existía en OpenV: lo vinculamos sin duplicarlo y sumamos las autorizaciones.',
    result.invited ? 'Le enviamos la invitación para crear su cuenta.' : '',
  ];
  return okWithLink(parts.filter(Boolean).join(' '), `/aliado/clientes/${result.id}?nuevo=1`, 'Abrir la ficha');
});

// ── Ficha: contacto, documentos, interacciones, etapas, autorizaciones ───

export const revealContactAction = allyAction('person.read', z.object({ opportunityId: zId }), async ({ opportunityId }, { session, meta }) => {
  const prisma = getPrisma();
  const opportunity = await scopedCase(prisma, session.user, opportunityId);
  if (!opportunity.person.phoneEnc) return fail('El cliente no tiene celular registrado.');
  const phone = decryptText(opportunity.person.phoneEnc);
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'person.contact_viewed', entity: 'Person', entityId: opportunity.personId, after: { opportunityId, field: 'phone' }, ipHash: meta.ipHash });
  return ok(phone);
});

export const uploadDocumentAction = allyAction(
  'doc.upload',
  z.object({ opportunityId: zId, typeId: zId, file: z.instanceof(File, { message: 'Adjunta un archivo.' }) }),
  async ({ opportunityId, typeId, file }, { session, meta }) => {
    const prisma = getPrisma();
    const document = await prisma.$transaction(async (tx) => {
      const opportunity = await scopedCase(tx, session.user, opportunityId);
      if (['WITHDRAWN', 'POSTSALE'].includes(opportunity.stage)) throw new UserError('El caso está cerrado; no admite nuevos documentos.');
      return saveUpload(tx, { file, personId: opportunity.personId, typeId, opportunityId }, { actor: session.user, meta });
    }, { timeout: 60_000, maxWait: 10_000 });
    revalidatePath(`/aliado/clientes/${opportunityId}`);
    return ok(
      document.status === 'QUARANTINED'
        ? 'Documento recibido. Está en verificación antivirus; quedará disponible para revisión en unos minutos.'
        : 'Documento cargado. Un analista lo revisará y verás el resultado aquí.',
    );
  },
);

const INTERACTION_CHANNELS = ['LLAMADA', 'VISITA', 'WHATSAPP', 'CORREO', 'NOTA'] as const;

export const addInteractionAction = allyAction(
  'case.note',
  z.object({ opportunityId: zId, channel: z.enum(INTERACTION_CHANNELS, 'Elige el canal.'), summary: zText(2000, 3, 'Describe brevemente la interacción.'), visibleToClient: zCheckbox }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const opportunity = await scopedCase(tx, session.user, input.opportunityId);
      const interaction = await tx.interaction.create({
        data: { opportunityId: opportunity.id, channel: input.channel, summary: input.summary, visibleToClient: input.visibleToClient, byUserId: session.user.id },
      });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'case.interaction_added', entity: 'Opportunity', entityId: opportunity.id, after: { interactionId: interaction.id, channel: input.channel, visibleToClient: input.visibleToClient }, ipHash: meta.ipHash }, tx);
      if (input.visibleToClient && opportunity.person.userId) {
        await notify({ userId: opportunity.person.userId, title: `Novedad en tu caso ${opportunity.code}`, body: input.summary.slice(0, 280), href: '/cliente/gestiones' }, tx);
      }
    }, TX);
    revalidatePath(`/aliado/clientes/${input.opportunityId}`);
    return ok('Interacción registrada.');
  },
);

/** El aliado solo mueve las etapas comerciales iniciales o marca desistimiento. */
const ALLY_MOVES: Record<string, string> = { CONTACTED: 'LEAD', PROFILED: 'CONTACTED' };

export const allyStageAction = allyAction(
  'case.create',
  z.object({ opportunityId: zId, to: z.enum(['CONTACTED', 'PROFILED']), note: zOptText(500) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const opportunity = await scopedCase(tx, session.user, input.opportunityId);
      if (opportunity.stage !== ALLY_MOVES[input.to]) {
        throw new UserError(`El caso está en ${STAGE_LABELS[opportunity.stage]}; desde el portal aliado solo puedes marcarlo como ${STAGE_LABELS[input.to]} cuando viene de ${STAGE_LABELS[ALLY_MOVES[input.to] as keyof typeof STAGE_LABELS]}.`);
      }
      await changeStage(tx, { opportunityId: opportunity.id, to: input.to, note: input.note ?? `Marcado por el aliado como ${STAGE_LABELS[input.to].toLowerCase()}` }, { actor: session.user, meta });
      if (input.to === 'CONTACTED') {
        await tx.opportunity.update({ where: { id: opportunity.id }, data: { nextAction: 'Perfilar al cliente y reunir documentos' } });
      }
    }, TX);
    revalidatePath('/aliado', 'layout');
    return ok(`Caso marcado como ${STAGE_LABELS[input.to].toLowerCase()}.`);
  },
);

export const withdrawAction = allyAction(
  'case.create',
  z.object({ opportunityId: zId, reason: zText(240, 5, 'Indica la causa del desistimiento.') }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const opportunity = await scopedCase(tx, session.user, input.opportunityId);
      if (['DISBURSED', 'POSTSALE', 'WITHDRAWN'].includes(opportunity.stage)) throw new UserError('Este caso ya está cerrado.');
      await changeStage(tx, { opportunityId: opportunity.id, to: 'WITHDRAWN', withdrawReason: input.reason }, { actor: session.user, meta });
    }, TX);
    revalidatePath('/aliado', 'layout');
    return ok('Caso marcado como desistido. Queda en la bitácora con su causa.');
  },
);

export const addConsentAction = allyAction(
  'person.create',
  z.object({ opportunityId: zId, consents: zCodes, declaration: zCheckbox }),
  async (input, { session, meta }) => {
    if (!input.consents.length) return fail('Marca al menos una autorización.');
    if (!input.declaration) return fail('Confirma que el cliente te autorizó expresamente y que conservas la evidencia.');
    await getPrisma().$transaction(async (tx) => {
      const opportunity = await scopedCase(tx, session.user, input.opportunityId);
      const active = await tx.consent.findMany({ where: { personId: opportunity.personId, revokedAt: null }, select: { purpose: true } });
      const missing = input.consents.filter((code) => !active.some((c) => c.purpose === code));
      if (!missing.length) throw new UserError('Esas autorizaciones ya están vigentes.');
      await tx.consent.createMany({ data: consentRecords(opportunity.personId, missing, { channel: 'aliado', capturedBy: session.user.id, ipHash: meta.ipHash, userAgent: meta.userAgent }) });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'consent.granted', entity: 'Person', entityId: opportunity.personId, after: { purposes: missing, channel: 'aliado', allyDeclaration: true, opportunityId: opportunity.id }, ipHash: meta.ipHash }, tx);
    }, TX);
    revalidatePath(`/aliado/clientes/${input.opportunityId}`);
    return ok('Autorizaciones registradas con la versión vigente del texto.');
  },
);

export const inviteClientAction = allyAction('case.note', z.object({ opportunityId: zId }), async ({ opportunityId }, { session, meta, orgId }) => {
  const sent = await getPrisma().$transaction(async (tx) => {
    const opportunity = await scopedCase(tx, session.user, opportunityId);
    if (opportunity.person.userId) throw new UserError('El cliente ya tiene cuenta en OpenV.');
    if (!opportunity.person.email) throw new UserError('El cliente no tiene correo registrado.');
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
    return inviteToRegister(tx, { personId: opportunity.personId, email: opportunity.person.email, firstName: opportunity.person.firstName, actor: session.user, allyName: org.name, ipHash: meta.ipHash });
  }, TX);
  revalidatePath(`/aliado/clientes/${opportunityId}`);
  if (sent === 'recent') return fail('Ya enviamos una invitación a este cliente en las últimas 24 horas.');
  return sent === 'sent' ? ok('Invitación enviada al correo del cliente.') : fail('Ese correo ya tiene una cuenta en OpenV.');
});
