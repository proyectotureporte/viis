import type { Prisma } from '@/app/generated/prisma/client';
import { UserError } from '@/lib/actions';
import { addMonths, amortize, compareIso, ENGINE_VERSION, simulatePortfolioPurchase, summarize, type LoanState } from '@/lib/finance';
import { toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { todayBogota } from './params';

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export interface UvrParams {
  uvr: number;
  uvrAsOf: string;
  uvrSource: string;
  inflation: number;
  inflationSource: string;
}

/** Últimos valores de UVR e inflación proyectada registrados en catálogos. */
export async function latestUvrParams(db: Db = getPrisma()): Promise<UvrParams | null> {
  const [uvr, inflation] = await Promise.all([
    db.financialParameter.findFirst({ where: { key: 'UVR' }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }] }),
    db.financialParameter.findFirst({ where: { key: 'INFLACION_PROYECTADA' }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }] }),
  ]);
  if (!uvr || !inflation) return null;
  return {
    uvr: Number(uvr.value),
    uvrAsOf: uvr.asOf.toISOString().slice(0, 10),
    uvrSource: uvr.source,
    inflation: Number(inflation.value),
    inflationSource: inflation.source,
  };
}

type LoanRow = {
  system: 'FIXED_PESOS' | 'UVR';
  rateEa: { toString(): string };
  termMonths: number;
  originalAmount: bigint;
  disbursedAt: Date;
  balance: bigint;
  balanceAsOf: Date;
  paidInstallments: number;
  monthlyInsurance: bigint;
  paymentDay: number;
};

/** Próxima fecha de pago (día `paymentDay`) estrictamente posterior a `asOf`. */
export function nextPaymentDate(asOf: string, paymentDay: number): string {
  const day = Math.min(Math.max(paymentDay, 1), 28);
  const candidate = `${asOf.slice(0, 7)}-${String(day).padStart(2, '0')}`;
  return compareIso(candidate, asOf) > 0 ? candidate : addMonths(candidate, 1);
}

/**
 * Traduce un crédito de la BD al estado que entiende el motor. En UVR usa el
 * último valor de UVR e inflación registrados; si faltan, lo exige.
 */
export function loanState(loan: LoanRow, uvr: UvrParams | null): LoanState {
  const asOf = loan.balanceAsOf.toISOString().slice(0, 10);
  const startDate = loan.disbursedAt.toISOString().slice(0, 10);
  const remainingMonths = Math.max(1, loan.termMonths - loan.paidInstallments);
  if (loan.system === 'UVR' && !uvr) {
    throw new UserError('Para calcular créditos en UVR registra primero el valor de la UVR y la inflación proyectada en Catálogos.');
  }
  return {
    principal: toNumber(loan.originalAmount),
    rateEa: Number(loan.rateEa.toString()),
    termMonths: loan.termMonths,
    system: loan.system,
    monthlyInsurance: toNumber(loan.monthlyInsurance),
    startDate: compareIso(startDate, asOf) < 0 ? startDate : asOf,
    uvr: loan.system === 'UVR' && uvr ? { initialValue: uvr.uvr, annualInflation: uvr.inflation } : undefined,
    uvrAtAsOf: loan.system === 'UVR' && uvr ? uvr.uvr : undefined,
    balance: toNumber(loan.balance),
    remainingMonths,
    asOf,
    nextPaymentDate: nextPaymentDate(asOf, loan.paymentDay),
  };
}

export interface OfferInput {
  amount: number;
  rateEa: number;
  termMonths: number;
  system: 'FIXED_PESOS' | 'UVR';
  monthlyInsurance: number;
  upfrontCosts: number;
}

export interface OfferResults {
  payment: number;
  months: number;
  payoffDate: string;
  totalInterest: number;
  totalInsurance: number;
  totalPaid: number;
  upfrontCosts: number;
  /** Todo lo que cuesta la oferta: cuotas + seguros + costos iniciales. */
  totalCost: number;
  /** Costo financiero (todo lo pagado por encima del capital, incluida la corrección UVR) por cada millón prestado. */
  costPerMillion: number;
  startDate: string;
  uvr?: { value: number; inflation: number; source: string };
  portfolio?: {
    loanId: string;
    loanAlias: string;
    basePayment: number;
    newPayment: number;
    monthlySavings: number;
    netSavings: number;
    breakEvenMonths: number | null;
    recommendation: string;
    recommendationText: string;
  };
  assumptions: string[];
  warnings: string[];
  engineVersion: string;
}

/**
 * Resultados normalizados de una oferta con el motor versionado. Si el cliente
 * tiene un crédito activo (compra de cartera), también la compara contra él.
 */
export function computeOffer(
  input: OfferInput,
  ctx: { uvr: UvrParams | null; currentLoan?: (LoanRow & { id: string; alias: string }) | null; today?: string },
): OfferResults {
  const startDate = ctx.today ?? todayBogota();
  if (input.system === 'UVR' && !ctx.uvr) {
    throw new UserError('Para ofertas en UVR registra primero el valor de la UVR y la inflación proyectada en Catálogos.');
  }
  let schedule;
  try {
    schedule = amortize({
      principal: input.amount,
      rateEa: input.rateEa,
      termMonths: input.termMonths,
      system: input.system,
      monthlyInsurance: input.monthlyInsurance,
      startDate,
      uvr: input.system === 'UVR' && ctx.uvr ? { initialValue: ctx.uvr.uvr, annualInflation: ctx.uvr.inflation } : undefined,
    });
  } catch (error) {
    throw new UserError(error instanceof RangeError ? `Datos de la oferta inválidos: ${error.message}.` : 'No se pudo calcular la oferta.');
  }
  const s = summarize(schedule);
  const totalCost = Math.round(s.totalPaid + input.upfrontCosts);
  // Todo lo pagado por encima del capital prestado: intereses, seguros, costos y, en UVR, la corrección monetaria.
  const financialCost = Math.max(0, totalCost - input.amount);
  const results: OfferResults = {
    payment: Math.round(s.payment),
    months: s.months,
    payoffDate: s.payoffDate,
    totalInterest: Math.round(s.totalInterest),
    totalInsurance: Math.round(s.totalInsurance),
    totalPaid: Math.round(s.totalPaid),
    upfrontCosts: input.upfrontCosts,
    totalCost,
    costPerMillion: Math.round(financialCost / (input.amount / 1_000_000)),
    startDate,
    uvr: input.system === 'UVR' && ctx.uvr ? { value: ctx.uvr.uvr, inflation: ctx.uvr.inflation, source: `${ctx.uvr.uvrSource} · ${ctx.uvr.inflationSource}` } : undefined,
    assumptions: [...schedule.assumptions, `Cálculo desde el ${startDate} como fecha de desembolso supuesta; costo por millón = (total pagado + costos iniciales − monto prestado) ÷ millones prestados; en UVR incluye la corrección monetaria proyectada.`],
    warnings: [...schedule.warnings, 'Resultado ilustrativo con los datos de la oferta: no es una oferta vinculante; la entidad define las condiciones finales.'],
    engineVersion: ENGINE_VERSION,
  };
  if (ctx.currentLoan) {
    try {
      const state = loanState(ctx.currentLoan, ctx.uvr);
      const pp = simulatePortfolioPurchase(state, {
        newRateEa: input.rateEa,
        newTermMonths: input.termMonths,
        costs: input.upfrontCosts,
        newMonthlyInsurance: input.monthlyInsurance,
      });
      results.portfolio = {
        loanId: ctx.currentLoan.id,
        loanAlias: ctx.currentLoan.alias,
        basePayment: Math.round(pp.results.basePayment),
        newPayment: Math.round(pp.results.newPayment),
        monthlySavings: Math.round(pp.results.monthlySavings),
        netSavings: Math.round(pp.results.netSavings),
        breakEvenMonths: pp.results.breakEvenMonths,
        recommendation: pp.results.recommendation,
        recommendationText: pp.results.recommendationText,
      };
      results.warnings.push(...pp.warnings);
    } catch (error) {
      if (error instanceof UserError) results.warnings.push(error.message);
      else results.warnings.push('No se pudo comparar contra el crédito actual del cliente.');
    }
  }
  return results;
}
