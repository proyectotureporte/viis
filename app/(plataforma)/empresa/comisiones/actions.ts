'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zDate, zId, zOptText, zPercent, zText } from '@/lib/actions';
import { addDaysYmd, dbDate, todayBogota } from '@/lib/empresa/params';
import { notify } from '@/lib/jobs';
import { money, PRODUCTS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

const zIds = z
  .union([zId, z.array(zId)], { error: 'Selecciona al menos una comisión.' })
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .pipe(z.array(zId).min(1, 'Selecciona al menos una comisión.').max(200, 'Máximo 200 comisiones por lote.'));

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const approveCommissionsAction = secureAction('commission.approve', z.object({ ids: zIds }), async ({ ids }, { session, meta }) => {
  const approved = await getPrisma().$transaction(async (tx) => {
    const rows = await tx.commission.findMany({ where: { id: { in: ids } }, include: { opportunity: { select: { code: true } } } });
    let count = 0;
    const now = new Date();
    for (const c of rows) {
      if (c.status !== 'CAUSED') continue;
      await tx.commission.update({ where: { id: c.id }, data: { status: 'APPROVED', approvedAt: now, approvedById: session.user.id } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission.approved', entity: 'Commission', entityId: c.id, before: { status: c.status }, after: { status: 'APPROVED', net: c.net }, ipHash: meta.ipHash }, tx);
      if (c.allyUserId) {
        await notify({ userId: c.allyUserId, title: `Comisión aprobada · ${c.opportunity.code}`, body: `Aprobamos tu comisión neta de ${money(c.net)}. Pago previsto: ${ymd(c.expectedPayAt)}.`, href: '/aliado/comisiones' }, tx);
      }
      count += 1;
    }
    if (!count) throw new UserError('Ninguna de las comisiones seleccionadas está en estado Causada.');
    return count;
  });
  revalidatePath('/empresa/comisiones');
  return ok(approved === 1 ? 'Comisión aprobada.' : `${approved} comisiones aprobadas.`);
});

export const scheduleCommissionAction = secureAction('commission.approve', z.object({ id: zId, payDate: zDate }), async ({ id, payDate }, { session, meta }) => {
  if (payDate < todayBogota()) throw new UserError('La fecha de pago no puede estar en el pasado.');
  await getPrisma().$transaction(async (tx) => {
    const c = await tx.commission.findUnique({ where: { id }, include: { opportunity: { select: { code: true } } } });
    if (!c) throw new UserError('La comisión no existe.');
    if (c.status !== 'APPROVED' && c.status !== 'SCHEDULED') throw new UserError('Solo se programa el pago de comisiones aprobadas.');
    await tx.commission.update({ where: { id }, data: { status: 'SCHEDULED', expectedPayAt: dbDate(payDate) } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission.scheduled', entity: 'Commission', entityId: id, before: { status: c.status, expectedPayAt: ymd(c.expectedPayAt) }, after: { status: 'SCHEDULED', expectedPayAt: payDate }, ipHash: meta.ipHash }, tx);
    if (c.allyUserId) {
      await notify({ userId: c.allyUserId, title: `Pago programado · ${c.opportunity.code}`, body: `Tu comisión neta de ${money(c.net)} se pagará el ${payDate}.`, href: '/aliado/comisiones' }, tx);
    }
  });
  revalidatePath('/empresa/comisiones');
  return ok('Pago programado.');
});

export const payCommissionAction = secureAction(
  'commission.pay',
  z.object({ id: zId, paymentRef: zText(120, 3, 'Indica la referencia del pago (transferencia, comprobante).') }),
  async ({ id, paymentRef }, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const c = await tx.commission.findUnique({ where: { id }, include: { opportunity: { select: { code: true } } } });
      if (!c) throw new UserError('La comisión no existe.');
      if (c.status !== 'APPROVED' && c.status !== 'SCHEDULED') throw new UserError('Solo se pagan comisiones aprobadas o programadas.');
      const paidAt = new Date();
      await tx.commission.update({ where: { id }, data: { status: 'PAID', paidAt, paymentRef } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission.paid', entity: 'Commission', entityId: id, before: { status: c.status }, after: { status: 'PAID', paymentRef, net: c.net }, ipHash: meta.ipHash }, tx);
      if (c.allyUserId) {
        await notify({ userId: c.allyUserId, title: `Comisión pagada · ${c.opportunity.code}`, body: `Pagamos tu comisión neta de ${money(c.net)}. Referencia: ${paymentRef}.`, href: '/aliado/comisiones' }, tx);
      }
    });
    revalidatePath('/empresa/comisiones');
    return ok('Comisión marcada como pagada.');
  },
);

export const reverseCommissionAction = secureAction(
  'commission.approve',
  z.object({ id: zId, reason: zText(300, 5, 'Escribe el motivo del reverso (mínimo 5 caracteres).') }),
  async ({ id, reason }, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const c = await tx.commission.findUnique({ where: { id }, include: { opportunity: { select: { code: true } } } });
      if (!c) throw new UserError('La comisión no existe.');
      if (c.status === 'REVERSED') throw new UserError('La comisión ya está reversada.');
      await tx.commission.update({ where: { id }, data: { status: 'REVERSED', reversedAt: new Date(), reverseReason: reason } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission.reversed', entity: 'Commission', entityId: id, before: { status: c.status }, after: { status: 'REVERSED', reason, wasPaid: c.status === 'PAID' }, ipHash: meta.ipHash }, tx);
      if (c.allyUserId) {
        await notify({ userId: c.allyUserId, title: `Comisión reversada · ${c.opportunity.code}`, body: `Reversamos la comisión de ${money(c.net)}. Motivo: ${reason}.`, href: '/aliado/comisiones' }, tx);
      }
    });
    revalidatePath('/empresa/comisiones');
    return ok('Comisión reversada.');
  },
);

// ── Reglas versionadas ─────────────────────────────────────────────────

const zOptId = z.union([zId, z.literal('')]).optional().transform((v) => v || undefined);
const zPaymentDays = z.coerce.number({ error: 'Días de pago inválidos.' }).int().min(0).max(365, 'Máximo 365 días.');
const zOptDate = z.union([zDate, z.literal('')]).optional().transform((v) => v || undefined);
const PRODUCT_CODES = Object.keys(PRODUCTS) as [string, ...string[]];

export const createRuleAction = secureAction(
  'commission.rules',
  z.object({
    name: zText(120, 3, 'Escribe un nombre para la regla.'),
    organizationId: zOptId,
    tier: zOptText(24),
    product: z.union([z.enum(PRODUCT_CODES), z.literal('')]).optional().transform((v) => v || undefined),
    percent: zPercent,
    withholdingPct: zPercent,
    paymentDays: zPaymentDays,
    validFrom: zDate,
    validTo: zOptDate,
  }),
  async (input, { session, meta }) => {
    if (input.organizationId && input.tier) throw new UserError('Elige una organización o un nivel, no ambos.');
    if (input.percent <= 0) throw new UserError('El porcentaje de comisión debe ser mayor que cero.');
    if (input.validTo && input.validTo < input.validFrom) throw new UserError('La vigencia final debe ser posterior a la inicial.');
    const id = await getPrisma().$transaction(async (tx) => {
      const exists = await tx.commissionRule.findFirst({ where: { name: input.name }, select: { id: true } });
      if (exists) throw new UserError('Ya existe una regla con ese nombre. Para cambiarla crea una nueva versión.');
      if (input.organizationId) {
        const org = await tx.organization.findFirst({ where: { id: input.organizationId, kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } }, select: { id: true } });
        if (!org) throw new UserError('La organización aliada no existe.');
      }
      const rule = await tx.commissionRule.create({
        data: {
          name: input.name,
          organizationId: input.organizationId ?? null,
          tier: input.tier?.toUpperCase() ?? null,
          product: input.product ?? null,
          basis: 'DISBURSED',
          percent: input.percent,
          withholdingPct: input.withholdingPct,
          paymentDays: input.paymentDays,
          version: 1,
          validFrom: dbDate(input.validFrom),
          validTo: input.validTo ? dbDate(input.validTo) : null,
          createdById: session.user.id,
        },
      });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission_rule.created', entity: 'CommissionRule', entityId: rule.id, after: { ...input, version: 1, basis: 'DISBURSED' }, ipHash: meta.ipHash }, tx);
      return rule.id;
    });
    revalidatePath('/empresa/comisiones');
    return ok(`Regla creada (versión 1, id ${id.slice(0, 8)}).`);
  },
);

export const versionRuleAction = secureAction(
  'commission.rules',
  z.object({
    ruleId: zId,
    percent: zPercent,
    withholdingPct: zPercent,
    paymentDays: zPaymentDays,
    validFrom: zDate,
    validTo: zOptDate,
    note: zOptText(300),
  }),
  async (input, { session, meta }) => {
    if (input.percent <= 0) throw new UserError('El porcentaje de comisión debe ser mayor que cero.');
    if (input.validTo && input.validTo < input.validFrom) throw new UserError('La vigencia final debe ser posterior a la inicial.');
    const version = await getPrisma().$transaction(async (tx) => {
      const base = await tx.commissionRule.findUnique({ where: { id: input.ruleId } });
      if (!base) throw new UserError('La regla no existe.');
      const latest = await tx.commissionRule.findFirst({ where: { name: base.name }, orderBy: { version: 'desc' } });
      if (!latest || latest.id !== base.id) throw new UserError(`Solo se versiona la última versión de la regla (v${latest?.version}).`);
      if (input.validFrom <= ymd(base.validFrom)) throw new UserError(`La nueva versión debe empezar después del ${ymd(base.validFrom)}.`);
      const closeOn = addDaysYmd(input.validFrom, -1);
      const baseValidTo = base.validTo ? ymd(base.validTo) : null;
      if (!baseValidTo || baseValidTo > closeOn) {
        await tx.commissionRule.update({ where: { id: base.id }, data: { validTo: dbDate(closeOn) } });
        await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission_rule.closed', entity: 'CommissionRule', entityId: base.id, before: { validTo: baseValidTo }, after: { validTo: closeOn, reason: `Reemplazada por la versión ${base.version + 1}` }, ipHash: meta.ipHash }, tx);
      }
      const rule = await tx.commissionRule.create({
        data: {
          name: base.name,
          organizationId: base.organizationId,
          tier: base.tier,
          product: base.product,
          basis: base.basis,
          percent: input.percent,
          withholdingPct: input.withholdingPct,
          paymentDays: input.paymentDays,
          version: base.version + 1,
          validFrom: dbDate(input.validFrom),
          validTo: input.validTo ? dbDate(input.validTo) : null,
          createdById: session.user.id,
        },
      });
      await audit({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: 'commission_rule.versioned',
        entity: 'CommissionRule',
        entityId: rule.id,
        before: { id: base.id, version: base.version, percent: base.percent.toString(), withholdingPct: base.withholdingPct.toString(), paymentDays: base.paymentDays },
        after: { version: rule.version, percent: input.percent, withholdingPct: input.withholdingPct, paymentDays: input.paymentDays, validFrom: input.validFrom, validTo: input.validTo, note: input.note },
        ipHash: meta.ipHash,
      }, tx);
      return rule.version;
    });
    revalidatePath('/empresa/comisiones');
    return ok(`Nueva versión ${version} creada. La anterior quedó cerrada el día previo a su inicio.`);
  },
);

export const closeRuleAction = secureAction(
  'commission.rules',
  z.object({ ruleId: zId, validTo: zDate, reason: zText(300, 5, 'Escribe el motivo del cierre (mínimo 5 caracteres).') }),
  async ({ ruleId, validTo, reason }, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const rule = await tx.commissionRule.findUnique({ where: { id: ruleId } });
      if (!rule) throw new UserError('La regla no existe.');
      if (validTo < ymd(rule.validFrom)) throw new UserError('La vigencia no puede terminar antes de empezar.');
      const before = rule.validTo ? ymd(rule.validTo) : null;
      if (before && before <= validTo) throw new UserError(`La regla ya termina el ${before}.`);
      await tx.commissionRule.update({ where: { id: ruleId }, data: { validTo: dbDate(validTo) } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission_rule.closed', entity: 'CommissionRule', entityId: ruleId, before: { validTo: before }, after: { validTo, reason }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath('/empresa/comisiones');
    return ok('Vigencia de la regla cerrada. Las comisiones ya causadas conservan su regla.');
  },
);
