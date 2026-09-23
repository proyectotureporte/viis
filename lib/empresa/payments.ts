import type { Prisma } from '@/app/generated/prisma/client';
import { UserError } from '@/lib/actions';
import { compareIso, remainingSchedule, simulatePrepayment } from '@/lib/finance';
import { money, toNumber } from '@/lib/labels';
import { audit } from '@/lib/security/audit';
import type { ActionCtx } from './access';
import { latestUvrParams, loanState } from './finance';

type Tx = Prisma.TransactionClient;

function loanSnapshotData(loan: {
  balance: bigint; balanceAsOf: Date; termMonths: number; paidInstallments: number; rateEa: { toString(): string }; system: string; monthlyInsurance: bigint; active: boolean;
}) {
  return {
    balance: loan.balance.toString(),
    balanceAsOf: loan.balanceAsOf.toISOString().slice(0, 10),
    termMonths: loan.termMonths,
    paidInstallments: loan.paidInstallments,
    rateEa: loan.rateEa.toString(),
    system: loan.system,
    monthlyInsurance: loan.monthlyInsurance.toString(),
    active: loan.active,
  };
}

/**
 * Aplica al gemelo un pago YA VALIDADO (spec §10: "el gemelo se actualiza solo
 * con pago validado"). Deja foto antes/después en LoanSnapshot y bitácora.
 *  - INSTALLMENT: suma una cuota pagada y toma el saldo de la tabla del motor.
 *  - PREPAYMENT: descuenta el abono del saldo; TERM reduce el plazo con el
 *    motor (mantiene la cuota); PAYMENT mantiene el plazo (baja la cuota).
 */
export async function applyValidatedPayment(tx: Tx, paymentId: string, ctx: ActionCtx): Promise<string> {
  const payment = await tx.paymentReport.findUniqueOrThrow({ where: { id: paymentId }, include: { loan: true } });
  const loan = payment.loan;
  const amount = toNumber(payment.amount);
  const paidOn = payment.paidOn.toISOString().slice(0, 10);
  const uvr = await latestUvrParams(tx);
  const state = loanState(loan, uvr);
  const before = loanSnapshotData(loan);

  let data: Prisma.LoanUpdateInput;
  let engine: Record<string, unknown>;
  let summary: string;

  if (payment.kind === 'INSTALLMENT') {
    if (loan.paidInstallments >= loan.termMonths) throw new UserError('El crédito ya no tiene cuotas pendientes según el gemelo; revisa el plazo antes de validar.');
    const schedule = remainingSchedule(state);
    const row = schedule.rows[0];
    const newBalance = BigInt(Math.max(0, Math.round(row.closingBalance)));
    const newPaid = loan.paidInstallments + 1;
    data = {
      paidInstallments: newPaid,
      balance: newBalance,
      balanceAsOf: new Date(`${row.date}T00:00:00Z`),
      active: newBalance > BigInt(0) && newPaid < loan.termMonths,
    };
    engine = { installment: row.n, installmentDate: row.date, expectedPayment: row.payment, principal: row.principal, interest: row.interest, closingBalance: row.closingBalance, engineVersion: schedule.engineVersion };
    if (Math.abs(row.payment - amount) > Math.max(1000, row.payment * 0.02)) {
      engine.note = `El valor reportado (${money(amount)}) difiere de la cuota esperada por el motor (${money(row.payment)}).`;
    }
    summary = `Cuota ${newPaid} aplicada. Saldo según la tabla: ${money(newBalance)}.`;
  } else if (payment.kind === 'PREPAYMENT') {
    const mode = payment.applyMode === 'PAYMENT' ? 'PAYMENT' : 'TERM';
    const currentBalance = toNumber(loan.balance);
    if (amount <= 0) throw new UserError('El valor del abono debe ser mayor que cero.');
    const newBalanceNum = Math.max(0, currentBalance - amount);
    const newBalance = BigInt(Math.round(newBalanceNum));
    const asOf = loan.balanceAsOf.toISOString().slice(0, 10);
    const effectiveDate = compareIso(paidOn, asOf) > 0 ? paidOn : asOf;
    let remaining = state.remainingMonths;
    let newPayment: number | null = null;
    if (newBalanceNum > 0) {
      const sim = simulatePrepayment(state, { amount, date: compareIso(paidOn, asOf) > 0 ? paidOn : nextDay(asOf), mode });
      if (mode === 'TERM') remaining = sim.results.scenario.months;
      newPayment = sim.results.newPayment || null;
      engine = { mode, basePayment: sim.results.basePayment, newPayment: sim.results.newPayment, monthsReduced: sim.results.monthsReduced, interestSaved: sim.results.interestSaved, newEndDate: sim.results.newEndDate, engineVersion: sim.engineVersion };
    } else {
      engine = { mode, paidOff: true };
    }
    data = {
      balance: newBalance,
      balanceAsOf: new Date(`${effectiveDate}T00:00:00Z`),
      termMonths: loan.paidInstallments + Math.max(1, remaining),
      active: newBalance > BigInt(0),
    };
    summary = newBalance === BigInt(0)
      ? 'El abono salda el crédito según el gemelo.'
      : mode === 'TERM'
        ? `Abono aplicado reduciendo plazo: quedan ${remaining} cuotas (antes ${state.remainingMonths}).`
        : `Abono aplicado manteniendo el plazo${newPayment ? `: nueva cuota estimada ${money(newPayment)}` : ''}.`;
  } else {
    throw new UserError('Tipo de pago desconocido.');
  }

  await tx.loanSnapshot.create({ data: { loanId: loan.id, reason: `Antes de aplicar pago validado ${payment.id.slice(0, 8)}`, data: before, createdById: ctx.actor.id } });
  const updated = await tx.loan.update({ where: { id: loan.id }, data });
  const after = loanSnapshotData(updated);
  await tx.loanSnapshot.create({
    data: { loanId: loan.id, reason: `Pago validado aplicado (${payment.kind === 'INSTALLMENT' ? 'cuota' : 'abono'})`, data: { ...after, paymentId: payment.id, engine } as Prisma.InputJsonValue, createdById: ctx.actor.id },
  });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'loan.payment_applied', entity: 'Loan', entityId: loan.id, before, after: { ...after, paymentId: payment.id, engine }, ipHash: ctx.meta.ipHash }, tx);
  return summary;
}

function nextDay(ymd: string): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
