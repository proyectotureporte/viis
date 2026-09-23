'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, UserError, zDate, zId, zMoney, zPercent, zText } from '@/lib/actions';
import { zOptId } from '@/lib/cliente/zod';
import { clientAction } from '@/lib/cliente/server';
import { dbDate, isoDay, todayBogota } from '@/lib/cliente/format';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

const loanSchema = z.object({
  id: zOptId,
  alias: zText(80, 1, 'Ponle un nombre al crédito (por ejemplo, "Crédito apartamento").'),
  entityId: zOptId,
  propertyId: zOptId,
  system: z.enum(['FIXED_PESOS', 'UVR'], { error: 'Elige el sistema del crédito.' }),
  rateEa: zPercent.pipe(z.number().gt(0, 'La tasa debe ser mayor que cero.').max(0.6, 'Revisa la tasa: parece demasiado alta.')),
  termMonths: z.coerce.number().int('El plazo va en meses enteros.').min(12, 'El plazo mínimo es 12 meses.').max(480, 'El plazo máximo es 480 meses.'),
  originalAmount: zMoney.pipe(z.number().min(1_000_000, 'Revisa el monto original.')),
  disbursedAt: zDate,
  balance: zMoney.pipe(z.number().min(1, 'Indica el saldo actual.')),
  balanceAsOf: zDate,
  paidInstallments: z.coerce.number().int().min(0, 'Las cuotas pagadas no pueden ser negativas.'),
  monthlyInsurance: zMoney,
  paymentDay: z.coerce.number().int().min(1, 'Día de pago entre 1 y 31.').max(31, 'Día de pago entre 1 y 31.'),
});

function snapshotData(loan: {
  alias: string; entityId: string | null; propertyId: string | null; system: string; rateEa: unknown; termMonths: number;
  originalAmount: bigint; disbursedAt: Date; balance: bigint; balanceAsOf: Date; paidInstallments: number;
  monthlyInsurance: bigint; paymentDay: number; confidence: string; source: string; active: boolean;
}) {
  return {
    alias: loan.alias,
    entityId: loan.entityId,
    propertyId: loan.propertyId,
    system: loan.system,
    rateEa: String(loan.rateEa),
    termMonths: loan.termMonths,
    originalAmount: loan.originalAmount.toString(),
    disbursedAt: isoDay(loan.disbursedAt),
    balance: loan.balance.toString(),
    balanceAsOf: isoDay(loan.balanceAsOf),
    paidInstallments: loan.paidInstallments,
    monthlyInsurance: loan.monthlyInsurance.toString(),
    paymentDay: loan.paymentDay,
    confidence: loan.confidence,
    source: loan.source,
    active: loan.active,
  };
}

export const saveLoanAction = clientAction(loanSchema, async (input, { session, meta, person }) => {
  const today = todayBogota();
  if (input.disbursedAt > today) throw new UserError('La fecha de desembolso no puede ser futura.');
  if (input.balanceAsOf > today) throw new UserError('La fecha del saldo no puede ser futura.');
  if (input.balanceAsOf < input.disbursedAt) throw new UserError('La fecha del saldo debe ser posterior al desembolso.');
  if (input.paidInstallments > input.termMonths) throw new UserError('Las cuotas pagadas no pueden superar el plazo total.');
  if (input.system === 'FIXED_PESOS' && input.balance > input.originalAmount) {
    throw new UserError('En un crédito en pesos el saldo de capital no supera el monto original. Revisa el extracto (el saldo de capital, sin intereses de mora).');
  }
  const prisma = getPrisma();
  const saved = await prisma.$transaction(async (tx) => {
    if (input.entityId && !(await tx.entity.findFirst({ where: { id: input.entityId, active: true }, select: { id: true } }))) {
      throw new UserError('Entidad no válida.');
    }
    if (input.propertyId && !(await tx.property.findFirst({ where: { id: input.propertyId, personId: person.id }, select: { id: true } }))) {
      throw new UserError('Inmueble no válido.');
    }
    const data = {
      alias: input.alias,
      entityId: input.entityId ?? null,
      propertyId: input.propertyId ?? null,
      system: input.system,
      rateEa: input.rateEa.toFixed(6),
      termMonths: input.termMonths,
      originalAmount: BigInt(input.originalAmount),
      disbursedAt: dbDate(input.disbursedAt),
      balance: BigInt(input.balance),
      balanceAsOf: dbDate(input.balanceAsOf),
      paidInstallments: input.paidInstallments,
      monthlyInsurance: BigInt(input.monthlyInsurance),
      paymentDay: input.paymentDay,
      confidence: 'DECLARED' as const,
      source: 'Declarado por el cliente',
    };
    if (input.id) {
      const before = await tx.loan.findFirst({ where: { id: input.id, personId: person.id } });
      if (!before) throw new UserError('Crédito no encontrado.');
      const loan = await tx.loan.update({ where: { id: before.id }, data });
      await tx.loanSnapshot.create({ data: { loanId: loan.id, reason: 'Actualización declarada por el cliente', data: snapshotData(loan), createdById: session.user.id } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'loan.updated', entity: 'Loan', entityId: loan.id, before: snapshotData(before), after: snapshotData(loan), ipHash: meta.ipHash }, tx);
      return loan;
    }
    const loan = await tx.loan.create({ data: { ...data, personId: person.id } });
    await tx.loanSnapshot.create({ data: { loanId: loan.id, reason: 'Registro declarado por el cliente', data: snapshotData(loan), createdById: session.user.id } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'loan.created', entity: 'Loan', entityId: loan.id, after: snapshotData(loan), ipHash: meta.ipHash }, tx);
    return loan;
  });
  revalidatePath('/cliente', 'layout');
  return ok(input.id ? `Guardamos los cambios de "${saved.alias}". Quedan como dato declarado por ti.` : `Registramos "${saved.alias}". Ya puedes ver tu cronograma y tus opciones.`);
});

export const closeLoanAction = clientAction(
  z.object({ id: zId, reason: z.enum(['PAID_OFF', 'TRANSFERRED', 'ERROR'], { error: 'Elige el motivo.' }) }),
  async (input, { session, meta, person }) => {
    const reasons = { PAID_OFF: 'Crédito pagado en su totalidad', TRANSFERRED: 'Crédito trasladado a otra entidad', ERROR: 'Registrado por error' };
    await getPrisma().$transaction(async (tx) => {
      const loan = await tx.loan.findFirst({ where: { id: input.id, personId: person.id, active: true } });
      if (!loan) throw new UserError('Crédito no encontrado.');
      const updated = await tx.loan.update({ where: { id: loan.id }, data: { active: false } });
      await tx.loanSnapshot.create({ data: { loanId: loan.id, reason: `Cerrado por el cliente: ${reasons[input.reason]}`, data: snapshotData(updated), createdById: session.user.id } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'loan.closed', entity: 'Loan', entityId: loan.id, after: { reason: input.reason }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath('/cliente', 'layout');
    return ok('El crédito quedó cerrado. Conservamos su historial.');
  },
);
