import type { Entity, Loan, Property } from '@/app/generated/prisma/client';
import { remainingSchedule, simulatePrepayment, type LoanState, type Schedule, type ScheduleRow } from '@/lib/finance';
import { toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { dueOnOrAfter, previousDue } from './format';
import { getUvrParams, loanStateOf, type UvrParams } from './server';

export type LoanWithRefs = Loan & { entity: Entity | null; property: Property | null };

export interface LoanView {
  loan: LoanWithRefs;
  state: LoanState | null;
  notices: string[];
  schedule: Schedule | null;
  /** Próximo vencimiento (según día de pago) y el anterior. */
  due: string;
  prevDue: string;
  /** Fila del cronograma estimada para el próximo vencimiento. */
  nextRow: ScheduleRow | null;
}

/** Gemelo hipotecario: cada crédito activo con su estado de motor y cronograma restante. */
export async function loadLoanViews(personId: string, today: string, params?: UvrParams): Promise<{ views: LoanView[]; params: UvrParams }> {
  const [loans, uvrParams] = await Promise.all([
    getPrisma().loan.findMany({
      where: { personId, active: true },
      include: { entity: true, property: true },
      orderBy: { createdAt: 'asc' },
    }),
    params ? Promise.resolve(params) : getUvrParams(),
  ]);
  const views = loans.map((loan): LoanView => {
    const { state, notices } = loanStateOf(loan, uvrParams);
    let schedule: Schedule | null = null;
    if (state) {
      try {
        schedule = remainingSchedule(state);
      } catch (error) {
        notices.push(`No pudimos calcular el cronograma con los datos registrados (${error instanceof Error ? error.message : 'dato inválido'}). Revisa el crédito.`);
      }
    }
    const due = dueOnOrAfter(today, loan.paymentDay);
    const prevDue = previousDue(due, loan.paymentDay);
    const nextRow = schedule ? (schedule.rows.find((r) => r.date === due) ?? schedule.rows.find((r) => r.date >= today) ?? null) : null;
    return { loan, state, notices, schedule, due, prevDue, nextRow };
  });
  return { views, params: uvrParams };
}

/**
 * Intereses evitados por abonos VALIDADOS (estimación). Para cada abono se
 * reconstruye el crédito como si no se hubiera hecho (saldo + abono) y se
 * simula aplicarlo en la próxima fecha de pago con su modalidad: la
 * diferencia de intereses restantes es lo que ese abono evita desde hoy.
 */
export function interestAvoided(state: LoanState, prepayments: Array<{ amount: bigint; applyMode: string | null }>): number {
  let total = 0;
  for (const p of prepayments) {
    const amount = toNumber(p.amount);
    if (amount <= 0) continue;
    try {
      const counterfactual: LoanState = { ...state, balance: state.balance + amount };
      const sim = simulatePrepayment(counterfactual, {
        amount,
        date: state.nextPaymentDate ?? state.asOf,
        mode: p.applyMode === 'PAYMENT' ? 'PAYMENT' : 'TERM',
      });
      total += Math.max(0, sim.results.interestSaved);
    } catch {
      // Un abono que no se puede simular no suma: nunca se inventa un ahorro.
    }
  }
  return total;
}

export function lastValuations<T extends { asOf: Date }>(valuations: T[]): { latest: T | null; previous: T | null } {
  const sorted = [...valuations].sort((a, b) => b.asOf.getTime() - a.asOf.getTime());
  return { latest: sorted[0] ?? null, previous: sorted[1] ?? null };
}

