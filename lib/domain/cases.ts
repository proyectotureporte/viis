import type { Prisma } from '@/app/generated/prisma/client';
import type { Stage } from '@/app/generated/prisma/enums';
import { nextCode, UserError } from '@/lib/actions';
import { consentRecords, normalizeDocument } from '@/lib/consent';
import { notify } from '@/lib/jobs';
import { STAGE_CLIENT_TEXT, STAGE_LABELS, STAGE_SLA_HOURS, PIPELINE_STAGES } from '@/lib/labels';
import { audit } from '@/lib/security/audit';
import { blindIndex, encryptText } from '@/lib/security/crypto';
import type { RequestMeta } from '@/lib/security/request';
import type { SessionUser } from '@/lib/security/session';
import { missingDocuments } from './documents';

type Tx = Prisma.TransactionClient;

/** Días de protección de un cliente para el aliado que lo registró primero. */
export const OWNERSHIP_DAYS = 180;

export function slaFor(stage: Stage, from = new Date()): Date | null {
  const hours = STAGE_SLA_HOURS[stage];
  return hours ? new Date(from.getTime() + hours * 3_600_000) : null;
}

export interface PersonInput {
  documentType: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  city?: string;
  monthlyIncome?: number;
}

/**
 * Búsqueda y alta sin duplicados (P0: "Como aliado registro un cliente sin
 * duplicarlo"). Deduplica por índice ciego del documento y aplica la regla de
 * titularidad: un cliente protegido por otro aliado no puede ser tomado.
 */
export async function findOrCreatePerson(
  tx: Tx,
  input: PersonInput,
  ctx: { actor: SessionUser; allyOrgId?: string | null; consents: string[]; meta: RequestMeta },
): Promise<{ personId: string; created: boolean }> {
  const normalized = input.documentNumber.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const documentIndex = blindIndex('doc', normalizeDocument(input.documentType, normalized));
  const existing = await tx.person.findUnique({ where: { documentIndex } });
  const now = new Date();

  if (existing) {
    const protectedByOther =
      ctx.allyOrgId &&
      existing.ownerAllyOrgId &&
      existing.ownerAllyOrgId !== ctx.allyOrgId &&
      existing.ownerUntil &&
      existing.ownerUntil > now;
    if (protectedByOther) {
      await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'person.ownership_conflict', entity: 'Person', entityId: existing.id, ipHash: ctx.meta.ipHash }, tx);
      throw new UserError('Este cliente ya está registrado y protegido por otro aliado. Si crees que es un error, escribe a contacto@viis.app.');
    }
    if (ctx.consents.length) {
      await tx.consent.createMany({ data: consentRecords(existing.id, ctx.consents, { channel: ctx.allyOrgId ? 'aliado' : 'asesor', capturedBy: ctx.actor.id, ipHash: ctx.meta.ipHash, userAgent: ctx.meta.userAgent }) });
    }
    if (ctx.allyOrgId && (!existing.ownerAllyOrgId || !existing.ownerUntil || existing.ownerUntil <= now)) {
      await tx.person.update({ where: { id: existing.id }, data: { ownerAllyOrgId: ctx.allyOrgId, ownerUntil: new Date(now.getTime() + OWNERSHIP_DAYS * 86_400_000) } });
    }
    return { personId: existing.id, created: false };
  }

  const person = await tx.person.create({
    data: {
      documentType: input.documentType,
      documentNumEnc: encryptText(normalized),
      documentIndex,
      documentLast4: normalized.slice(-4),
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email?.toLowerCase() || null,
      phoneEnc: input.phone ? encryptText(input.phone) : null,
      city: input.city || null,
      monthlyIncome: input.monthlyIncome ? BigInt(input.monthlyIncome) : null,
      ownerAllyOrgId: ctx.allyOrgId ?? null,
      ownerUntil: ctx.allyOrgId ? new Date(now.getTime() + OWNERSHIP_DAYS * 86_400_000) : null,
      createdById: ctx.actor.id,
    },
  });
  await tx.consent.createMany({
    data: consentRecords(person.id, ctx.consents, { channel: ctx.allyOrgId ? 'aliado' : 'asesor', capturedBy: ctx.actor.id, ipHash: ctx.meta.ipHash, userAgent: ctx.meta.userAgent }),
  });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'person.created', entity: 'Person', entityId: person.id, after: { consents: ctx.consents, allyOrgId: ctx.allyOrgId ?? null }, ipHash: ctx.meta.ipHash }, tx);
  return { personId: person.id, created: true };
}

export async function createOpportunity(
  tx: Tx,
  input: {
    personId: string;
    product: string;
    amount?: number;
    channel: string;
    allyOrgId?: string | null;
    allyUserId?: string | null;
    assigneeId?: string | null;
    entityId?: string | null;
    nextAction?: string;
  },
  ctx: { actor: SessionUser; meta: RequestMeta },
): Promise<{ id: string; code: string }> {
  const open = await tx.opportunity.findFirst({
    where: { personId: input.personId, product: input.product, stage: { notIn: ['WITHDRAWN', 'DISBURSED', 'POSTSALE'] } },
    select: { code: true },
  });
  if (open) throw new UserError(`Ya existe un caso activo de este tipo para el cliente (${open.code}).`);
  const code = await nextCode('OV', tx);
  const opportunity = await tx.opportunity.create({
    data: {
      code,
      personId: input.personId,
      product: input.product,
      amount: input.amount ? BigInt(input.amount) : null,
      channel: input.channel,
      allyOrgId: input.allyOrgId ?? null,
      allyUserId: input.allyUserId ?? null,
      assigneeId: input.assigneeId ?? null,
      entityId: input.entityId ?? null,
      nextAction: input.nextAction ?? 'Contactar al cliente',
      slaDueAt: slaFor('LEAD'),
      createdById: ctx.actor.id,
      stages: { create: { to: 'LEAD', byUserId: ctx.actor.id, note: 'Caso creado' } },
    },
  });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'case.created', entity: 'Opportunity', entityId: opportunity.id, after: { code, product: input.product, channel: input.channel }, ipHash: ctx.meta.ipHash }, tx);
  return { id: opportunity.id, code };
}

/** Transiciones permitidas: avanzar, retroceder un paso (novedad) o desistir. */
export function allowedTransitions(from: Stage): Stage[] {
  if (from === 'WITHDRAWN') return ['LEAD'];
  if (from === 'DISBURSED') return ['POSTSALE'];
  if (from === 'POSTSALE') return [];
  const index = PIPELINE_STAGES.indexOf(from);
  const next: Stage[] = [];
  if (index >= 0 && index < PIPELINE_STAGES.length - 1) next.push(PIPELINE_STAGES[index + 1]);
  if (index > 0) next.push(PIPELINE_STAGES[index - 1]);
  next.push('WITHDRAWN');
  return next;
}

/** Cursos críticos vencidos del aliado: bloquean radicar (spec §8 Academia). */
export async function allyBlockingCertifications(tx: Tx, allyUserId: string): Promise<string[]> {
  const critical = await tx.course.findMany({ where: { critical: true, active: true }, select: { id: true, title: true } });
  if (!critical.length) return [];
  const valid = await tx.certification.findMany({
    where: { userId: allyUserId, courseId: { in: critical.map((c) => c.id) }, expiresAt: { gt: new Date() } },
    select: { courseId: true },
  });
  const ok = new Set(valid.map((v) => v.courseId));
  return critical.filter((c) => !ok.has(c.id)).map((c) => c.title);
}

export async function changeStage(
  tx: Tx,
  input: { opportunityId: string; to: Stage; note?: string; disbursedAmount?: number; withdrawReason?: string },
  ctx: { actor: SessionUser; meta: RequestMeta },
): Promise<void> {
  const opportunity = await tx.opportunity.findUniqueOrThrow({
    where: { id: input.opportunityId },
    include: { person: { include: { user: true, consents: { where: { revokedAt: null } } } }, allyUser: true },
  });
  const from = opportunity.stage;
  if (!allowedTransitions(from).includes(input.to)) {
    throw new UserError(`No se puede pasar de ${STAGE_LABELS[from]} a ${STAGE_LABELS[input.to]}.`);
  }

  if (input.to === 'FILED') {
    if (!opportunity.person.consents.some((c) => c.purpose === 'ENTIDADES')) {
      throw new UserError('Para radicar falta la autorización del cliente para compartir su expediente con entidades financieras.');
    }
    if (!opportunity.entityId) throw new UserError('Asigna la entidad financiera antes de radicar.');
    const missing = await missingDocuments(tx, opportunity.personId, opportunity.product);
    if (missing.length) throw new UserError(`Faltan documentos aprobados: ${missing.map((m) => m.name).join(', ')}.`);
    if (opportunity.allyUserId) {
      const blocking = await allyBlockingCertifications(tx, opportunity.allyUserId);
      if (blocking.length) {
        throw new UserError(`Radicación bloqueada: el aliado tiene certificaciones críticas vencidas o pendientes (${blocking.join(', ')}).`);
      }
    }
  }
  if (input.to === 'DISBURSED' && !input.disbursedAmount) throw new UserError('Indica el monto desembolsado.');
  if (input.to === 'WITHDRAWN' && !input.withdrawReason) throw new UserError('Indica la causa del desistimiento.');

  const now = new Date();
  await tx.opportunity.update({
    where: { id: opportunity.id },
    data: {
      stage: input.to,
      stageAt: now,
      slaDueAt: slaFor(input.to, now),
      escalatedAt: null,
      disbursedAmount: input.disbursedAmount ? BigInt(input.disbursedAmount) : undefined,
      withdrawReason: input.withdrawReason ?? undefined,
      stages: { create: { from, to: input.to, note: input.note ?? input.withdrawReason, byUserId: ctx.actor.id } },
    },
  });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'case.stage_changed', entity: 'Opportunity', entityId: opportunity.id, before: { stage: from }, after: { stage: input.to, note: input.note, disbursedAmount: input.disbursedAmount }, ipHash: ctx.meta.ipHash }, tx);

  if (input.to === 'DISBURSED' && opportunity.allyOrgId) {
    await causeCommission(tx, { opportunityId: opportunity.id, base: input.disbursedAmount!, actor: ctx.actor, meta: ctx.meta });
  }

  if (opportunity.person.user) {
    await notify({
      userId: opportunity.person.user.id,
      title: `Tu caso ${opportunity.code}: ${STAGE_LABELS[input.to]}`,
      body: STAGE_CLIENT_TEXT[input.to],
      href: '/cliente/gestiones',
      email: { to: opportunity.person.user.email },
    }, tx);
  }
  if (opportunity.allyUser && opportunity.allyUser.id !== ctx.actor.id) {
    await notify({
      userId: opportunity.allyUser.id,
      title: `${opportunity.code} pasó a ${STAGE_LABELS[input.to]}`,
      body: `${opportunity.person.firstName} ${opportunity.person.lastName}${input.note ? ` · ${input.note}` : ''}`,
      href: `/aliado/clientes/${opportunity.id}`,
    }, tx);
  }
}

// ── Comisiones ─────────────────────────────────────────────────────────

type RuleRow = Prisma.CommissionRuleGetPayload<object>;

/** Regla aplicable más específica: organización > nivel > general; producto exacto > cualquiera; mayor versión. */
export function pickRule(rules: RuleRow[], org: { id: string; tier: string }, product: string, on: Date): RuleRow | null {
  const day = on.toISOString().slice(0, 10);
  const candidates = rules.filter(
    (r) =>
      r.active &&
      r.validFrom.toISOString().slice(0, 10) <= day &&
      (!r.validTo || r.validTo.toISOString().slice(0, 10) >= day) &&
      (!r.organizationId || r.organizationId === org.id) &&
      (!r.tier || r.tier === org.tier) &&
      (!r.product || r.product === product),
  );
  const score = (r: RuleRow) => (r.organizationId ? 100 : r.tier ? 50 : 0) + (r.product ? 10 : 0);
  candidates.sort((a, b) => score(b) - score(a) || b.version - a.version);
  return candidates[0] ?? null;
}

export function computeCommission(base: number, percent: number, withholdingPct: number) {
  const gross = Math.round(base * percent);
  const withholding = Math.round(gross * withholdingPct);
  return { gross, withholding, net: gross - withholding };
}

export async function causeCommission(
  tx: Tx,
  input: { opportunityId: string; base: number; actor: SessionUser; meta: RequestMeta },
): Promise<void> {
  const opportunity = await tx.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId }, include: { allyOrg: true } });
  if (!opportunity.allyOrg) return;
  const existing = await tx.commission.findUnique({ where: { opportunityId_allyOrgId: { opportunityId: opportunity.id, allyOrgId: opportunity.allyOrg.id } } });
  if (existing && existing.status !== 'REVERSED') return;
  // La regla que protege el negocio es la vigente cuando se creó el caso (los cambios no alteran negocios protegidos).
  const rules = await tx.commissionRule.findMany({ where: { active: true } });
  const rule = pickRule(rules, opportunity.allyOrg, opportunity.product, opportunity.createdAt) ?? pickRule(rules, opportunity.allyOrg, opportunity.product, new Date());
  if (!rule) {
    await audit({ actorId: input.actor.id, actorRole: input.actor.role, action: 'commission.no_rule', entity: 'Opportunity', entityId: opportunity.id, ipHash: input.meta.ipHash }, tx);
    return;
  }
  const percent = Number(rule.percent);
  const amounts = computeCommission(input.base, percent, Number(rule.withholdingPct));
  const expectedPayAt = new Date(Date.now() + rule.paymentDays * 86_400_000);
  const snapshot = { id: rule.id, name: rule.name, version: rule.version, percent: rule.percent.toString(), withholdingPct: rule.withholdingPct.toString(), basis: rule.basis, paymentDays: rule.paymentDays, validFrom: rule.validFrom, validTo: rule.validTo, organizationId: rule.organizationId, tier: rule.tier, product: rule.product };
  const data = {
    allyUserId: opportunity.allyUserId,
    ruleId: rule.id,
    ruleSnapshot: snapshot,
    baseAmount: BigInt(input.base),
    percent: rule.percent,
    gross: BigInt(amounts.gross),
    withholding: BigInt(amounts.withholding),
    net: BigInt(amounts.net),
    status: 'CAUSED' as const,
    causedAt: new Date(),
    expectedPayAt,
    approvedAt: null,
    approvedById: null,
    paidAt: null,
    paymentRef: null,
    reversedAt: null,
    reverseReason: null,
  };
  const commission = existing
    ? await tx.commission.update({ where: { id: existing.id }, data })
    : await tx.commission.create({ data: { ...data, opportunityId: opportunity.id, allyOrgId: opportunity.allyOrg.id } });
  await audit({ actorId: input.actor.id, actorRole: input.actor.role, action: 'commission.caused', entity: 'Commission', entityId: commission.id, after: { base: input.base, ...amounts, rule: snapshot }, ipHash: input.meta.ipHash }, tx);
  if (opportunity.allyUserId) {
    await notify({ userId: opportunity.allyUserId, title: `Comisión causada · ${opportunity.code}`, body: `Se causó una comisión neta estimada de $${amounts.net.toLocaleString('es-CO')}.`, href: '/aliado/comisiones' }, tx);
  }
}
