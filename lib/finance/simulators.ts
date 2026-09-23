/**
 * Simuladores sobre el motor de amortización. Cada uno devuelve
 * { inputs, results, assumptions, warnings, engineVersion } para trazabilidad.
 *
 * Ningún simulador promete resultados: son estimaciones con los supuestos que
 * se listan, y así deben mostrarse al usuario.
 */

import { amortize, remainingSchedule } from './amortization';
import { addMonths, days360 } from './dates';
import { toCents } from './rates';
import type {
  AmortizationSystem,
  Costs,
  ExtraPaymentMode,
  LoanState,
  Schedule,
  SimulationResult,
  UvrProjection,
} from './types';
import { ENGINE_VERSION } from './version';

/** Fecha neutra para simulaciones donde el calendario no altera el resultado. */
const REFERENCE_DATE = '2026-01-01';

export const HOUSING_INCOME_RATIO_ASSUMPTION =
  'Límite de cuota: en Colombia la primera cuota de un crédito de vivienda no debería superar el 30 % de los ingresos familiares (Decreto 145 de 2000, reglamentario de la Ley 546 de 1999). Es un parámetro ajustable; cada entidad aplica su propia política.';

// ───────────────────────── utilidades ─────────────────────────

function build<I, R>(inputs: I, results: R, assumptions: string[], warnings: string[]): SimulationResult<I, R> {
  return { inputs, results, assumptions: [...new Set(assumptions)], warnings: [...new Set(warnings)], engineVersion: ENGINE_VERSION };
}

/** Suma costos dados como total o como desglose por concepto. */
export function sumCosts(costs: Costs | undefined): number {
  if (costs === undefined) return 0;
  if (typeof costs === 'number') return costs;
  return Object.values(costs).reduce((a, b) => a + b, 0);
}

function assertFraction(name: string, value: number, { min = -1, max = 1 } = {}): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} debe ser una fracción entre ${min} y ${max} (0.05 = 5 %); recibido ${value}`);
  }
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} debe ser un número ≥ 0`);
}

export interface ScheduleSummary {
  /** Cuota inicial con seguros. */
  payment: number;
  months: number;
  payoffDate: string;
  totalInterest: number;
  totalInsurance: number;
  totalPaid: number;
}

export function summarize(s: Schedule): ScheduleSummary {
  return {
    payment: s.basePayment,
    months: s.months,
    payoffDate: s.payoffDate,
    totalInterest: s.totals.interest,
    totalInsurance: s.totals.insurance,
    totalPaid: s.totals.paid,
  };
}

/** Estado sin abonos programados: para comparar escenarios en igualdad de condiciones. */
function withoutExtras(loan: LoanState): LoanState {
  return { ...loan, extraPayments: [], recurringExtra: undefined };
}

// ───────────────────────── abono extraordinario ─────────────────────────

export interface PrepaymentParams {
  amount: number;
  date: string;
  mode: ExtraPaymentMode;
}

export interface PrepaymentResults {
  interestSaved: number;
  insuranceSaved: number;
  /** Diferencia de todo lo pagado (intereses + seguros ahorrados). */
  totalSaved: number;
  monthsReduced: number;
  basePayment: number;
  /** Cuota (con seguros) de la primera cuota posterior al abono; 0 si el crédito queda saldado. */
  newPayment: number;
  baseEndDate: string;
  newEndDate: string;
  paidOff: boolean;
  base: ScheduleSummary;
  scenario: ScheduleSummary;
}

export function simulatePrepayment(
  loan: LoanState,
  params: PrepaymentParams,
): SimulationResult<{ loan: LoanState; params: PrepaymentParams }, PrepaymentResults> {
  assertNonNegative('amount', params.amount);
  const base = remainingSchedule(loan);
  const scenario = remainingSchedule({
    ...loan,
    extraPayments: [...(loan.extraPayments ?? []), params],
  });
  const applyIdx = scenario.rows.findIndex((r) => r.date >= params.date);
  const next = applyIdx >= 0 ? scenario.rows[applyIdx + 1] : undefined;
  const paidOff = scenario.rows[scenario.rows.length - 1].closingBalance === 0 && applyIdx === scenario.rows.length - 1;

  const warnings = [...scenario.warnings];
  if (paidOff) warnings.push('El abono alcanza para saldar el crédito. Antes de usarlo todo, confirme que conserva un fondo de emergencia.');
  if (applyIdx < 0) warnings.push('La fecha del abono es posterior al fin del crédito; no tiene efecto.');
  warnings.push('Confirme con su entidad cómo aplicará el abono (a plazo o a cuota); la elección debe quedar por escrito.');

  return build(
    { loan, params },
    {
      interestSaved: toCents(base.totals.interest - scenario.totals.interest),
      insuranceSaved: toCents(base.totals.insurance - scenario.totals.insurance),
      totalSaved: toCents(base.totals.paid - scenario.totals.paid),
      monthsReduced: base.months - scenario.months,
      basePayment: base.basePayment,
      newPayment: next ? next.payment : 0,
      baseEndDate: base.payoffDate,
      newEndDate: scenario.payoffDate,
      paidOff,
      base: summarize(base),
      scenario: summarize(scenario),
    },
    scenario.assumptions,
    warnings,
  );
}

// ───────────────────────── cambio de plazo ─────────────────────────

export interface TermChangeParams {
  newTermMonths: number;
  costs?: Costs;
}

export interface TermChangeResults {
  basePayment: number;
  newPayment: number;
  /** newPayment − basePayment (negativo = la cuota baja). */
  paymentDifference: number;
  costs: number;
  baseTotalCost: number;
  /** Todo lo que se pagaría con el plazo nuevo, incluidos los costos del trámite. */
  newTotalCost: number;
  /** newTotalCost − baseTotalCost (positivo = cuesta más en total). */
  totalCostDifference: number;
  base: ScheduleSummary;
  scenario: ScheduleSummary;
}

export function simulateTermChange(
  loan: LoanState,
  params: TermChangeParams,
): SimulationResult<{ loan: LoanState; params: TermChangeParams }, TermChangeResults> {
  const clean = withoutExtras(loan);
  const base = remainingSchedule(clean);
  const scenario = remainingSchedule({ ...clean, remainingMonths: params.newTermMonths });
  const costs = sumCosts(params.costs);
  const newTotalCost = toCents(scenario.totals.paid + costs);
  const warnings: string[] = [];
  if (params.newTermMonths > loan.remainingMonths) {
    warnings.push('Ampliar el plazo baja la cuota pero aumenta el total de intereses pagados.');
  }
  if (params.newTermMonths < loan.remainingMonths) {
    warnings.push('Reducir el plazo sube la cuota: verifique que no supere su capacidad de pago.');
  }
  return build(
    { loan, params },
    {
      basePayment: base.basePayment,
      newPayment: scenario.basePayment,
      paymentDifference: toCents(scenario.basePayment - base.basePayment),
      costs,
      baseTotalCost: base.totals.paid,
      newTotalCost,
      totalCostDifference: toCents(newTotalCost - base.totals.paid),
      base: summarize(base),
      scenario: summarize(scenario),
    },
    [...scenario.assumptions, 'La comparación excluye abonos programados en ambos escenarios.'],
    warnings,
  );
}

// ───────────────────────── compra de cartera ─────────────────────────

export interface PortfolioPurchaseParams {
  newRateEa: number;
  /** Por defecto, las cuotas restantes actuales. */
  newTermMonths?: number;
  /** Estudio de crédito, avalúo, notariales, registro, etc. */
  costs?: Costs;
  /** Por defecto, el seguro fijo actual. */
  newMonthlyInsurance?: number;
  /** Por defecto, la tasa de seguro de vida actual. */
  newInsuranceRateMonthly?: number;
}

export type PortfolioRecommendation = 'conviene revisar' | 'no parece conveniente';

export interface PortfolioPurchaseResults {
  basePayment: number;
  newPayment: number;
  monthlySavings: number;
  grossSavings: number;
  costs: number;
  /** Ahorro total descontando costos del traslado. */
  netSavings: number;
  /** Mes en que el ahorro acumulado cubre los costos; null si nunca. */
  breakEvenMonths: number | null;
  recommendation: PortfolioRecommendation;
  recommendationText: string;
  base: ScheduleSummary;
  scenario: ScheduleSummary;
}

export function simulatePortfolioPurchase(
  loan: LoanState,
  params: PortfolioPurchaseParams,
): SimulationResult<{ loan: LoanState; params: PortfolioPurchaseParams }, PortfolioPurchaseResults> {
  const clean = withoutExtras(loan);
  const base = remainingSchedule(clean);
  const scenario = remainingSchedule({
    ...clean,
    rateEa: params.newRateEa,
    remainingMonths: params.newTermMonths ?? loan.remainingMonths,
    monthlyInsurance: params.newMonthlyInsurance ?? loan.monthlyInsurance,
    insuranceRateMonthly: params.newInsuranceRateMonthly ?? loan.insuranceRateMonthly,
  });
  const costs = sumCosts(params.costs);
  const grossSavings = toCents(base.totals.paid - scenario.totals.paid);
  const netSavings = toCents(grossSavings - costs);

  // Punto de equilibrio: primer mes en que Σ(cuota actual − cuota nueva) ≥ costos.
  let breakEvenMonths: number | null = null;
  let cumulative = 0;
  const horizon = Math.max(base.rows.length, scenario.rows.length);
  for (let m = 0; m < horizon; m++) {
    cumulative += (base.rows[m]?.payment ?? 0) - (scenario.rows[m]?.payment ?? 0);
    if (cumulative > 0 && cumulative >= costs) {
      breakEvenMonths = m + 1;
      break;
    }
  }

  const worthReviewing = netSavings > 0 && breakEvenMonths !== null && breakEvenMonths <= loan.remainingMonths;
  const recommendation: PortfolioRecommendation = worthReviewing ? 'conviene revisar' : 'no parece conveniente';
  const recommendationText = worthReviewing
    ? `Con estos supuestos, el traslado podría representar un ahorro neto estimado y los costos se recuperarían hacia el mes ${breakEvenMonths}. Conviene revisar una oferta formal por escrito y confirmar costos y seguros antes de decidir.`
    : 'Con estos supuestos, el traslado no parece conveniente: el ahorro estimado no alcanza a cubrir los costos o no se recupera dentro del plazo. Puede valer la pena negociar primero con su entidad actual.';

  const warnings = [
    'Estimación: la tasa, los costos y los seguros definitivos dependen de la aprobación y la oferta formal de la nueva entidad.',
  ];
  if (costs === 0) warnings.push('No se incluyeron costos del traslado (estudio, avalúo, notariales, registro); el ahorro real será menor.');
  if ((params.newTermMonths ?? loan.remainingMonths) > loan.remainingMonths) {
    warnings.push('El plazo nuevo es mayor que el restante: la cuota baja, pero se pagan intereses durante más tiempo.');
  }

  return build(
    { loan, params },
    {
      basePayment: base.basePayment,
      newPayment: scenario.basePayment,
      monthlySavings: toCents(base.basePayment - scenario.basePayment),
      grossSavings,
      costs,
      netSavings,
      breakEvenMonths,
      recommendation,
      recommendationText,
      base: summarize(base),
      scenario: summarize(scenario),
    },
    [
      ...scenario.assumptions,
      'Ahorro = total pagado con el crédito actual − total pagado con el nuevo; ahorro neto descuenta los costos del traslado. Sin descontar el valor del dinero en el tiempo.',
      'La comparación excluye abonos programados en ambos escenarios.',
    ],
    warnings,
  );
}

// ───────────────────────── cuota objetivo / ingreso mínimo ─────────────────────────

export interface TargetPaymentParams {
  principal: number;
  rateEa: number;
  termMonths: number;
  monthlyInsurance?: number;
  system: AmortizationSystem;
  uvr?: UvrProjection;
  /** Fracción máxima de ingresos para la cuota. Por defecto 0.3 (30 %). */
  incomeRatioLimit?: number;
}

export interface TargetPaymentResults {
  /** Primera cuota total, con seguros. */
  payment: number;
  /** Cuota máxima proyectada (en UVR crece con la inflación; en pesos es la misma). */
  maxPayment: number;
  incomeRatioLimit: number;
  /** Ingreso mensual mínimo para que la primera cuota quede dentro del límite. */
  minIncome: number;
  /** Ingreso que se necesitaría para la cuota máxima proyectada. */
  minIncomeAtMaxPayment: number;
}

export function simulateTargetPayment(
  params: TargetPaymentParams,
): SimulationResult<TargetPaymentParams, TargetPaymentResults> {
  const limit = params.incomeRatioLimit ?? 0.3;
  assertFraction('incomeRatioLimit', limit, { min: 0.01, max: 1 });
  const s = amortize({
    principal: params.principal,
    rateEa: params.rateEa,
    termMonths: params.termMonths,
    system: params.system,
    monthlyInsurance: params.monthlyInsurance,
    uvr: params.uvr,
    startDate: REFERENCE_DATE,
  });
  const maxPayment = Math.max(...s.rows.slice(0, -1).map((r) => r.payment), s.basePayment);
  const warnings: string[] = [];
  if (params.system === 'UVR') {
    warnings.push('En UVR la cuota en pesos sube con la inflación; el ingreso también debería crecer para mantener la proporción.');
  }
  return build(
    { ...params, incomeRatioLimit: limit },
    {
      payment: s.basePayment,
      maxPayment: toCents(maxPayment),
      incomeRatioLimit: limit,
      minIncome: toCents(s.basePayment / limit),
      minIncomeAtMaxPayment: toCents(maxPayment / limit),
    },
    [...s.assumptions, HOUSING_INCOME_RATIO_ASSUMPTION],
    warnings,
  );
}

// ───────────────────────── tasa fija vs UVR ─────────────────────────

export interface FixedVsUvrScenario {
  inflation: number;
  initialPayment: number;
  finalPayment: number;
  maxPayment: number;
  /** Total pagado en pesos corrientes. */
  totalPaid: number;
  /** Total pagado deflactado a pesos de hoy con la inflación del escenario. */
  totalPaidReal: number;
  /** Total del crédito a tasa fija deflactado con la misma inflación, para comparar. */
  fixedTotalPaidReal: number;
  /** totalPaid (UVR) − totalPaid (tasa fija), en pesos corrientes. */
  differenceVsFixed: number;
}

export interface FixedVsUvrResults {
  fixed: { payment: number; totalPaid: number };
  scenarios: FixedVsUvrScenario[];
  range: { initialMin: number; initialMax: number; finalMin: number; finalMax: number; totalMin: number; totalMax: number };
}

export function simulateFixedVsUvr(
  principal: number,
  termMonths: number,
  rateFixedEa: number,
  rateUvrEa: number,
  inflationScenarios: number[],
): SimulationResult<
  { principal: number; termMonths: number; rateFixedEa: number; rateUvrEa: number; inflationScenarios: number[] },
  FixedVsUvrResults
> {
  if (inflationScenarios.length === 0) throw new RangeError('Se requiere al menos un escenario de inflación');
  inflationScenarios.forEach((x) => assertFraction('inflationScenarios', x));
  const fixed = amortize({ principal, rateEa: rateFixedEa, termMonths, system: 'FIXED_PESOS', startDate: REFERENCE_DATE });

  const deflate = (s: Schedule, inflation: number) =>
    toCents(s.rows.reduce((acc, r, k) => acc + (r.payment + r.extra) / Math.pow(1 + inflation, (k + 1) / 12), 0));

  const scenarios = inflationScenarios.map((inflation): FixedVsUvrScenario => {
    // El nivel de la UVR no altera el resultado en pesos: se usa UVR₀ = 1.
    const s = amortize({
      principal,
      rateEa: rateUvrEa,
      termMonths,
      system: 'UVR',
      uvr: { initialValue: 1, annualInflation: inflation },
      startDate: REFERENCE_DATE,
    });
    const payments = s.rows.map((r) => r.payment);
    return {
      inflation,
      initialPayment: s.basePayment,
      finalPayment: payments[payments.length - 1],
      maxPayment: Math.max(...payments),
      totalPaid: s.totals.paid,
      totalPaidReal: deflate(s, inflation),
      fixedTotalPaidReal: deflate(fixed, inflation),
      differenceVsFixed: toCents(s.totals.paid - fixed.totals.paid),
    };
  });

  const pick = (f: (s: FixedVsUvrScenario) => number) => scenarios.map(f);
  return build(
    { principal, termMonths, rateFixedEa, rateUvrEa, inflationScenarios },
    {
      fixed: { payment: fixed.basePayment, totalPaid: fixed.totals.paid },
      scenarios,
      range: {
        initialMin: Math.min(...pick((s) => s.initialPayment)),
        initialMax: Math.max(...pick((s) => s.initialPayment)),
        finalMin: Math.min(...pick((s) => s.finalPayment)),
        finalMax: Math.max(...pick((s) => s.finalPayment)),
        totalMin: Math.min(...pick((s) => s.totalPaid)),
        totalMax: Math.max(...pick((s) => s.totalPaid)),
      },
    },
    [
      ...fixed.assumptions,
      ...amortize({ principal, rateEa: rateUvrEa, termMonths, system: 'UVR', uvr: { initialValue: 1, annualInflation: 0 }, startDate: REFERENCE_DATE }).assumptions,
      'Inflación constante durante todo el plazo en cada escenario.',
      'Total real = pagos deflactados a pesos de hoy con la inflación del escenario.',
    ],
    [
      'Los escenarios de inflación son supuestos, no pronósticos: la inflación real puede ser mayor o menor y cambiar cada año.',
      'En UVR la cuota y el saldo en pesos pueden subir durante años; el saldo en pesos puede superar temporalmente el monto prestado.',
      'Esta comparación no es una certeza ni una recomendación de producto.',
    ],
  );
}

// ───────────────────────── abonos periódicos ─────────────────────────

export interface ExtraordinaryParams {
  amount: number;
  everyMonths: number;
  mode: ExtraPaymentMode;
}

export interface ExtraordinaryResults {
  baseEndDate: string;
  /** Fecha estimada de terminación con los abonos. */
  newEndDate: string;
  monthsReduced: number;
  interestSaved: number;
  totalExtraContributed: number;
  /** Esfuerzo mensual equivalente: monto / cada cuántos meses. */
  monthlyEquivalentEffort: number;
  basePayment: number;
  /** Cuota (con seguros) justo después del primer abono. */
  paymentAfterFirstExtra: number;
  base: ScheduleSummary;
  scenario: ScheduleSummary;
}

export function simulateExtraordinary(
  loan: LoanState,
  params: ExtraordinaryParams,
): SimulationResult<{ loan: LoanState; params: ExtraordinaryParams }, ExtraordinaryResults> {
  assertNonNegative('amount', params.amount);
  const clean = withoutExtras(loan);
  const base = remainingSchedule(clean);
  const firstDate = loan.nextPaymentDate ?? addMonths(loan.asOf, 1);
  const scenario = remainingSchedule({
    ...clean,
    recurringExtra: { amount: params.amount, everyMonths: params.everyMonths, startDate: firstDate, mode: params.mode },
  });
  const firstExtraIdx = scenario.rows.findIndex((r) => r.extra > 0);
  const after = firstExtraIdx >= 0 ? scenario.rows[firstExtraIdx + 1] : undefined;

  return build(
    { loan, params },
    {
      baseEndDate: base.payoffDate,
      newEndDate: scenario.payoffDate,
      monthsReduced: base.months - scenario.months,
      interestSaved: toCents(base.totals.interest - scenario.totals.interest),
      totalExtraContributed: scenario.totals.extra,
      monthlyEquivalentEffort: toCents(params.amount / params.everyMonths),
      basePayment: base.basePayment,
      paymentAfterFirstExtra: after ? after.payment : 0,
      base: summarize(base),
      scenario: summarize(scenario),
    },
    [...scenario.assumptions, `Abonos de igual monto cada ${params.everyMonths} mes(es) desde ${firstDate}, sin interrupciones.`],
    [
      ...scenario.warnings,
      'Solo abone si conserva un fondo de emergencia de al menos 3 cuotas y no tiene deudas más caras.',
    ],
  );
}

// ───────────────────────── estrés del hogar ─────────────────────────

export type AlertLevel = 'OK' | 'VIGILAR' | 'RIESGO';

export interface StressParams {
  monthlyIncome: number;
  /** Gastos mensuales del hogar SIN la cuota del crédito. */
  monthlyExpenses: number;
  /** Cuota mensual total del crédito. */
  payment: number;
  savings: number;
  /** Caída del ingreso (fracción: 0.2 = cae 20 %). */
  incomeDropPct: number;
  /** Gasto nuevo mensual en pesos (salud, educación...). */
  newExpense: number;
}

export interface StressResults {
  stressedIncome: number;
  stressedExpenses: number;
  /** Ingreso − gastos − cuota en el escenario de estrés. */
  monthlyMargin: number;
  /** Cuota / ingreso en estrés; null si el ingreso cae a cero. */
  paymentToIncome: number | null;
  /** Meses que el ahorro cubre el déficit; null si no hay déficit. */
  coverageMonths: number | null;
  /** Meses de gastos + cuota que el ahorro cubriría si el ingreso se detuviera. */
  reserveMonths: number | null;
  alert: AlertLevel;
  plan: string[];
}

export function simulateStress(params: StressParams): SimulationResult<StressParams, StressResults> {
  assertFraction('incomeDropPct', params.incomeDropPct, { min: 0, max: 1 });
  (['monthlyIncome', 'monthlyExpenses', 'payment', 'savings', 'newExpense'] as const).forEach((k) =>
    assertNonNegative(k, params[k]),
  );
  const stressedIncome = params.monthlyIncome * (1 - params.incomeDropPct);
  const stressedExpenses = params.monthlyExpenses + params.newExpense;
  const margin = stressedIncome - stressedExpenses - params.payment;
  const paymentToIncome = stressedIncome > 0 ? params.payment / stressedIncome : Infinity;
  const coverageMonths = margin < 0 ? params.savings / -margin : null;
  const obligations = stressedExpenses + params.payment;
  const reserveMonths = obligations > 0 ? params.savings / obligations : Infinity;

  let alert: AlertLevel = 'OK';
  if (stressedIncome <= 0 || (coverageMonths !== null && coverageMonths < 6) || paymentToIncome > 0.5) {
    alert = 'RIESGO';
  } else if (margin < 0 || margin < 0.1 * stressedIncome || paymentToIncome > 0.3 || reserveMonths < 3) {
    alert = 'VIGILAR';
  }

  const plan: string[] = [];
  if (alert === 'RIESGO') {
    plan.push('Hable con su banco ANTES de atrasarse: pregunte por periodos de gracia, ampliación de plazo o reestructuración.');
    plan.push('Priorice la cuota de vivienda y los gastos esenciales; pause abonos extraordinarios y gastos no urgentes.');
    plan.push('Revise los seguros del crédito: el de desempleo o incapacidad, si lo tiene, podría cubrir cuotas.');
  }
  if (alert !== 'OK') {
    plan.push('Arme o refuerce un fondo de emergencia equivalente a 3 a 6 meses de gastos y cuota.');
    plan.push('Identifique gastos que pueda reducir y consulte si le conviene mover la fecha de pago al día en que recibe su ingreso.');
  }
  if (alert === 'OK') {
    plan.push('Su margen resiste este escenario. Mantenga un fondo de emergencia de al menos 3 meses de gastos y cuota.');
  }

  const round2 = (x: number) => Math.round(x * 100) / 100;
  return build(
    params,
    {
      stressedIncome: toCents(stressedIncome),
      stressedExpenses: toCents(stressedExpenses),
      monthlyMargin: toCents(margin),
      paymentToIncome: Number.isFinite(paymentToIncome) ? round2(paymentToIncome) : null,
      coverageMonths: coverageMonths === null ? null : round2(coverageMonths),
      reserveMonths: Number.isFinite(reserveMonths) ? round2(reserveMonths) : null,
      alert,
      plan,
    },
    [
      'Los gastos mensuales ingresados no incluyen la cuota del crédito.',
      'RIESGO: déficit que el ahorro cubre menos de 6 meses, ingreso nulo o cuota > 50 % del ingreso. VIGILAR: déficit, margen < 10 % del ingreso, cuota > 30 % del ingreso o ahorro < 3 meses de obligaciones.',
    ],
    ['Es un escenario hipotético para prevenir, no un diagnóstico financiero.'],
  );
}

// ───────────────────────── arrendar vs comprar ─────────────────────────

export interface RentVsBuyParams {
  /** Arriendo mensual actual. */
  rent: number;
  rentIncreasePct: number;
  price: number;
  downPayment: number;
  rateEa: number;
  termMonths: number;
  appreciationPct: number;
  /** Mantenimiento anual como fracción del valor del inmueble (incluye predial y administración si se desea). */
  maintenancePct: number;
  horizonYears: number;
  /** Rentabilidad anual de la alternativa de inversión (fracción EA). */
  opportunityRatePct: number;
}

export interface RentVsBuyYear {
  year: number;
  rentCost: number;
  mortgagePaid: number;
  maintenance: number;
  buyCost: number;
  homeValue: number;
  loanBalance: number;
  homeEquity: number;
  buyerPortfolio: number;
  renterPortfolio: number;
  buyerNetWorth: number;
  renterNetWorth: number;
}

export interface RentVsBuyResults {
  years: RentVsBuyYear[];
  buyerNetWorth: number;
  renterNetWorth: number;
  /** buyerNetWorth − renterNetWorth. */
  difference: number;
  favored: 'COMPRAR' | 'ARRENDAR' | 'SIMILAR';
}

export function simulateRentVsBuy(params: RentVsBuyParams): SimulationResult<RentVsBuyParams, RentVsBuyResults> {
  const p = params;
  (['rentIncreasePct', 'appreciationPct', 'maintenancePct', 'opportunityRatePct'] as const).forEach((k) =>
    assertFraction(k, p[k]),
  );
  assertNonNegative('rent', p.rent);
  assertNonNegative('downPayment', p.downPayment);
  if (p.downPayment > p.price) throw new RangeError('La cuota inicial no puede superar el precio');
  if (!Number.isInteger(p.horizonYears) || p.horizonYears < 1) throw new RangeError('horizonYears debe ser un entero ≥ 1');

  const loanAmount = p.price - p.downPayment;
  const schedule =
    loanAmount > 0
      ? amortize({ principal: loanAmount, rateEa: p.rateEa, termMonths: p.termMonths, system: 'FIXED_PESOS', startDate: REFERENCE_DATE })
      : null;

  let buyerPortfolio = 0;
  let renterPortfolio = p.downPayment; // quien arrienda invierte la cuota inicial
  const years: RentVsBuyYear[] = [];
  for (let y = 1; y <= p.horizonYears; y++) {
    const rows = schedule ? schedule.rows.slice((y - 1) * 12, y * 12) : [];
    const mortgagePaid = rows.reduce((a, r) => a + r.payment, 0);
    const lastIdx = y * 12 - 1;
    const loanBalance = schedule ? (schedule.rows[lastIdx]?.closingBalance ?? 0) : 0;
    const valueStart = p.price * Math.pow(1 + p.appreciationPct, y - 1);
    const homeValue = p.price * Math.pow(1 + p.appreciationPct, y);
    const maintenance = valueStart * p.maintenancePct;
    const buyCost = mortgagePaid + maintenance;
    const rentCost = p.rent * 12 * Math.pow(1 + p.rentIncreasePct, y - 1);

    // Ambos rinden a la tasa de oportunidad; quien gasta menos en el año invierte la diferencia al cierre.
    buyerPortfolio *= 1 + p.opportunityRatePct;
    renterPortfolio *= 1 + p.opportunityRatePct;
    const diff = buyCost - rentCost;
    if (diff > 0) renterPortfolio += diff;
    else buyerPortfolio += -diff;

    const homeEquity = homeValue - loanBalance;
    years.push({
      year: y,
      rentCost: toCents(rentCost),
      mortgagePaid: toCents(mortgagePaid),
      maintenance: toCents(maintenance),
      buyCost: toCents(buyCost),
      homeValue: toCents(homeValue),
      loanBalance,
      homeEquity: toCents(homeEquity),
      buyerPortfolio: toCents(buyerPortfolio),
      renterPortfolio: toCents(renterPortfolio),
      buyerNetWorth: toCents(homeEquity + buyerPortfolio),
      renterNetWorth: toCents(renterPortfolio),
    });
  }
  const last = years[years.length - 1];
  const difference = toCents(last.buyerNetWorth - last.renterNetWorth);
  const tolerance = 0.02 * Math.max(Math.abs(last.buyerNetWorth), Math.abs(last.renterNetWorth), 1);
  const favored = Math.abs(difference) <= tolerance ? 'SIMILAR' : difference > 0 ? 'COMPRAR' : 'ARRENDAR';

  return build(
    params,
    { years, buyerNetWorth: last.buyerNetWorth, renterNetWorth: last.renterNetWorth, difference, favored },
    [
      ...(schedule?.assumptions ?? []),
      'Crédito en pesos a tasa fija, sin seguros.',
      'Quien arrienda invierte la cuota inicial y, cada año, la diferencia si comprar le hubiera costado más; quien compra invierte la diferencia en el caso contrario. Aportes al cierre de cada año.',
      'Valorización, incremento del arriendo, mantenimiento y rentabilidad constantes durante el horizonte.',
      'Patrimonio del comprador = valor del inmueble − saldo del crédito + inversiones. "SIMILAR" si la diferencia es ≤ 2 %.',
    ],
    [
      'No incluye gastos de compra (notariales, registro), costos de venta, impuestos ni beneficios tributarios.',
      'Los supuestos de valorización y rentabilidad son hipotéticos; el resultado cambia mucho con ellos.',
    ],
  );
}

// ───────────────────────── venta del inmueble ─────────────────────────

export interface SaleParams {
  price: number;
  loanBalance: number;
  /** Comisión y gastos de venta como fracción del precio. */
  saleCostsPct: number;
  /** Impuestos estimados en pesos (ganancia ocasional, retención, etc.). */
  taxesEstimate: number;
}

export interface SaleResults {
  saleCosts: number;
  netAvailable: number;
}

export function simulateSale(params: SaleParams): SimulationResult<SaleParams, SaleResults> {
  assertFraction('saleCostsPct', params.saleCostsPct, { min: 0, max: 1 });
  (['price', 'loanBalance', 'taxesEstimate'] as const).forEach((k) => assertNonNegative(k, params[k]));
  const saleCosts = toCents(params.price * params.saleCostsPct);
  const netAvailable = toCents(params.price - params.loanBalance - saleCosts - params.taxesEstimate);
  const warnings = ['Los impuestos son una estimación; confírmelos con un contador antes de negociar.'];
  if (netAvailable < 0) warnings.push('Con este precio la venta no alcanza para pagar el crédito y los gastos: faltaría dinero.');
  return build(
    params,
    { saleCosts, netAvailable },
    ['Disponible neto = precio − saldo del crédito − gastos de venta − impuestos estimados.', 'El saldo a pagar debe confirmarse con un paz y salvo del banco a la fecha de la venta.'],
    warnings,
  );
}

// ───────────────────────── utilidades de estado ─────────────────────────

/** Meses (30E/360) entre dos fechas; útil para derivar remainingMonths. */
export function monthsBetween(a: string, b: string): number {
  return days360(a, b) / 30;
}
