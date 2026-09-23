/**
 * Despachador de simulaciones del portal cliente. Módulo PURO: lo usa el
 * navegador (cálculo inmediato) y el servidor (recalcula antes de guardar,
 * con el crédito leído de la base de datos, nunca el enviado por el cliente).
 */
import { remainingSchedule } from '@/lib/finance/amortization';
import { addMonths, compareIso } from '@/lib/finance/dates';
import {
  simulateExtraordinary,
  simulateFixedVsUvr,
  simulatePortfolioPurchase,
  simulatePrepayment,
  simulateRentVsBuy,
  simulateSale,
  simulateStress,
  simulateTargetPayment,
  simulateTermChange,
} from '@/lib/finance/simulators';
import type { AmortizationSystem, ExtraPaymentMode, LoanState } from '@/lib/finance/types';
import { ENGINE_VERSION } from '@/lib/finance/version';
import { pesos, porcentaje } from '@/lib/formato';
import { isoText, monthsText, rateText } from './format';

export const SIM_KINDS = [
  'PREPAYMENT',
  'TERM_CHANGE',
  'PORTFOLIO',
  'FREE_EARLY',
  'EXTRAORDINARY',
  'TARGET_PAYMENT',
  'FIXED_VS_UVR',
  'STRESS',
  'RENT_VS_BUY',
  'SALE',
] as const;
export type SimKind = (typeof SIM_KINDS)[number];

export const SIM_META: Record<SimKind, { label: string; question: string; needsLoan: boolean }> = {
  PREPAYMENT: { label: 'Abono a capital', question: '¿Qué pasa si hago un abono a capital?', needsLoan: true },
  TERM_CHANGE: { label: 'Cambio de plazo', question: '¿Cuánto cambia mi cuota y el costo total si cambio el plazo?', needsLoan: true },
  PORTFOLIO: { label: 'Compra de cartera', question: '¿Me conviene trasladar el crédito a otra entidad?', needsLoan: true },
  FREE_EARLY: { label: 'Ruta Libre Antes', question: '¿Cuánto debo abonar cada mes para terminar en la fecha que quiero?', needsLoan: true },
  EXTRAORDINARY: { label: 'Cuota extraordinaria', question: '¿Qué logro con abonos periódicos (por ejemplo, la prima)?', needsLoan: true },
  TARGET_PAYMENT: { label: 'Cuota objetivo', question: '¿Cuánto pagaría por un crédito y qué ingreso necesito?', needsLoan: false },
  FIXED_VS_UVR: { label: 'Pesos vs UVR', question: '¿Cómo se comparan tasa fija en pesos y UVR con varias inflaciones?', needsLoan: false },
  STRESS: { label: 'Capacidad ante choque', question: '¿Aguanta mi hogar si baja el ingreso o sube un gasto?', needsLoan: false },
  RENT_VS_BUY: { label: 'Comprar vs arrendar', question: '¿Me conviene comprar o seguir arrendando?', needsLoan: false },
  SALE: { label: 'Venta del inmueble', question: '¿Cuánto me quedaría si vendo mi vivienda?', needsLoan: false },
};

// ── Parámetros por tipo (fracciones para porcentajes, pesos enteros) ───────

export interface PrepaymentInput { amount: number; date: string; mode: ExtraPaymentMode }
export interface TermChangeInput { newTermMonths: number; costs: number }
export interface PortfolioInput { newRateEa: number; newTermMonths?: number; costs: number; newMonthlyInsurance?: number }
export interface FreeEarlyInput { targetDate: string }
export interface ExtraordinaryInput { amount: number; everyMonths: number; mode: ExtraPaymentMode }
export interface TargetPaymentInput {
  principal: number;
  rateEa: number;
  termMonths: number;
  monthlyInsurance: number;
  system: AmortizationSystem;
  inflation?: number;
  incomeRatioLimit: number;
  monthlyIncome?: number;
}
export interface FixedVsUvrInput { principal: number; termMonths: number; rateFixedEa: number; rateUvrEa: number; inflations: number[] }
export interface StressInput { monthlyIncome: number; monthlyExpenses: number; payment: number; savings: number; incomeDropPct: number; newExpense: number }
export interface RentVsBuyInput {
  rent: number;
  rentIncreasePct: number;
  price: number;
  downPayment: number;
  rateEa: number;
  termMonths: number;
  appreciationPct: number;
  maintenancePct: number;
  horizonYears: number;
  opportunityRatePct: number;
}
export interface SaleInput { price: number; loanBalance: number; saleCostsPct: number; taxesEstimate: number }

export type SimParams =
  | PrepaymentInput
  | TermChangeInput
  | PortfolioInput
  | FreeEarlyInput
  | ExtraordinaryInput
  | TargetPaymentInput
  | FixedVsUvrInput
  | StressInput
  | RentVsBuyInput
  | SaleInput;

export interface SimOutput {
  kind: SimKind;
  inputs: unknown;
  results: Record<string, unknown>;
  assumptions: string[];
  warnings: string[];
  engineVersion: string;
}

export const NOT_BINDING =
  'Simulación no vinculante: es una estimación con los datos y supuestos indicados, no una oferta ni una promesa de ahorro. Las condiciones definitivas las fija tu entidad.';

/** Ruta Libre Antes: abono mensual mínimo (múltiplo de $1.000) para terminar en la fecha objetivo. */
export function simulateFreeEarly(loan: LoanState, params: FreeEarlyInput): SimOutput {
  const base = remainingSchedule({ ...loan, extraPayments: [], recurringExtra: undefined });
  const firstDate = loan.nextPaymentDate ?? addMonths(loan.asOf, 1);
  const assumptions = [
    ...base.assumptions,
    `Abono mensual constante desde ${firstDate}, aplicado a reducir plazo (se mantiene la cuota).`,
    'Se busca el menor abono mensual, en múltiplos de $1.000, con el que la última cuota cae en la fecha objetivo o antes.',
  ];
  const warnings = [
    'Solo abone si conserva un fondo de emergencia de al menos 3 cuotas y no tiene deudas más caras.',
    'Confirme con su entidad que los abonos se apliquen a capital con reducción de plazo; pídalo por escrito.',
  ];
  const baseEndDate = base.payoffDate;
  const common = { targetDate: params.targetDate, baseEndDate, basePayment: base.basePayment };
  if (compareIso(params.targetDate, baseEndDate) >= 0) {
    return {
      kind: 'FREE_EARLY',
      inputs: { loan, params },
      results: { ...common, feasible: true, alreadyOnTrack: true, monthlyExtra: 0, newEndDate: baseEndDate, monthsReduced: 0, interestSaved: 0, totalExtraContributed: 0, totalMonthlyEffort: base.basePayment },
      assumptions,
      warnings: ['Con las cuotas actuales ya terminarías en esa fecha o antes: no necesitas abonos adicionales.'],
      engineVersion: ENGINE_VERSION,
    };
  }
  if (compareIso(params.targetDate, firstDate) < 0) {
    return {
      kind: 'FREE_EARLY',
      inputs: { loan, params },
      results: { ...common, feasible: false, alreadyOnTrack: false, monthlyExtra: 0, newEndDate: baseEndDate, monthsReduced: 0, interestSaved: 0, totalExtraContributed: 0, totalMonthlyEffort: base.basePayment },
      assumptions,
      warnings: ['La fecha objetivo es anterior a tu próxima cuota: elige una fecha posterior.'],
      engineVersion: ENGINE_VERSION,
    };
  }
  const reaches = (amount: number) =>
    compareIso(simulateExtraordinary(loan, { amount, everyMonths: 1, mode: 'TERM' }).results.newEndDate, params.targetDate) <= 0;
  let lo = 0;
  let hi = Math.ceil(loan.balance);
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  let amount = Math.ceil(hi / 1000) * 1000;
  if (!reaches(amount)) amount = Math.ceil(loan.balance / 1000) * 1000;
  const sim = simulateExtraordinary(loan, { amount, everyMonths: 1, mode: 'TERM' });
  const r = sim.results;
  return {
    kind: 'FREE_EARLY',
    inputs: { loan, params },
    results: {
      ...common,
      feasible: true,
      alreadyOnTrack: false,
      monthlyExtra: amount,
      newEndDate: r.newEndDate,
      monthsReduced: r.monthsReduced,
      interestSaved: r.interestSaved,
      totalExtraContributed: r.totalExtraContributed,
      totalMonthlyEffort: base.basePayment + amount,
    },
    assumptions: [...new Set([...assumptions, ...sim.assumptions])],
    warnings: [...new Set([...warnings, ...sim.warnings])],
    engineVersion: sim.engineVersion,
  };
}

/** Ejecuta la simulación `kind`. Lanza RangeError/Error si faltan datos o son inválidos. */
export function runSimulation(kind: SimKind, params: SimParams, loan: LoanState | null): SimOutput {
  const needLoan = (): LoanState => {
    if (!loan) throw new Error('Esta simulación necesita un crédito registrado con saldo y condiciones completas.');
    return loan;
  };
  const wrap = (r: { inputs: unknown; results: object; assumptions: string[]; warnings: string[]; engineVersion: string }): SimOutput => ({
    kind,
    inputs: r.inputs,
    results: r.results as Record<string, unknown>,
    assumptions: r.assumptions,
    warnings: r.warnings,
    engineVersion: r.engineVersion,
  });
  switch (kind) {
    case 'PREPAYMENT': {
      const p = params as PrepaymentInput;
      const l = needLoan();
      if (compareIso(p.date, l.asOf) <= 0) throw new Error('La fecha del abono debe ser posterior a la fecha de corte del saldo.');
      return wrap(simulatePrepayment(l, { amount: p.amount, date: p.date, mode: p.mode }));
    }
    case 'TERM_CHANGE': {
      const p = params as TermChangeInput;
      return wrap(simulateTermChange(needLoan(), { newTermMonths: p.newTermMonths, costs: p.costs }));
    }
    case 'PORTFOLIO': {
      const p = params as PortfolioInput;
      return wrap(
        simulatePortfolioPurchase(needLoan(), {
          newRateEa: p.newRateEa,
          newTermMonths: p.newTermMonths,
          costs: p.costs,
          newMonthlyInsurance: p.newMonthlyInsurance,
        }),
      );
    }
    case 'FREE_EARLY':
      return simulateFreeEarly(needLoan(), params as FreeEarlyInput);
    case 'EXTRAORDINARY': {
      const p = params as ExtraordinaryInput;
      return wrap(simulateExtraordinary(needLoan(), { amount: p.amount, everyMonths: p.everyMonths, mode: p.mode }));
    }
    case 'TARGET_PAYMENT': {
      const p = params as TargetPaymentInput;
      if (p.system === 'UVR' && (p.inflation === undefined || !Number.isFinite(p.inflation))) {
        throw new Error('Para UVR indica una inflación anual supuesta.');
      }
      const out = wrap(
        simulateTargetPayment({
          principal: p.principal,
          rateEa: p.rateEa,
          termMonths: p.termMonths,
          monthlyInsurance: p.monthlyInsurance,
          system: p.system,
          uvr: p.system === 'UVR' ? { initialValue: 1, annualInflation: p.inflation ?? 0 } : undefined,
          incomeRatioLimit: p.incomeRatioLimit,
        }),
      );
      out.inputs = p;
      if (p.monthlyIncome && p.monthlyIncome > 0) {
        const minIncome = Number(out.results.minIncome);
        out.results.monthlyIncome = p.monthlyIncome;
        out.results.incomeCovers = p.monthlyIncome >= minIncome;
        if (p.monthlyIncome < minIncome) out.warnings.push('Tu ingreso indicado está por debajo del ingreso mínimo estimado para esa cuota.');
      }
      return out;
    }
    case 'FIXED_VS_UVR': {
      const p = params as FixedVsUvrInput;
      return wrap(simulateFixedVsUvr(p.principal, p.termMonths, p.rateFixedEa, p.rateUvrEa, p.inflations));
    }
    case 'STRESS':
      return wrap(simulateStress(params as StressInput));
    case 'RENT_VS_BUY':
      return wrap(simulateRentVsBuy(params as RentVsBuyInput));
    case 'SALE':
      return wrap(simulateSale(params as SaleInput));
  }
}

// ── Resumen legible de resultados (pantalla, comparación y PDF) ────────────

export interface SummaryLine {
  label: string;
  value: string;
}

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const money = (v: unknown) => pesos(n(v));
const alertText: Record<string, string> = { OK: 'Resiste el escenario', VIGILAR: 'Vigilar', RIESGO: 'Riesgo alto' };

export function summarizeResults(kind: string, results: Record<string, unknown>): SummaryLine[] {
  const r = results;
  switch (kind) {
    case 'PREPAYMENT':
      return [
        { label: 'Intereses que te ahorrarías', value: money(r.interestSaved) },
        { label: 'Ahorro total (intereses + seguros)', value: money(r.totalSaved) },
        { label: 'Meses menos de crédito', value: monthsText(n(r.monthsReduced)) },
        { label: 'Cuota actual', value: money(r.basePayment) },
        { label: 'Cuota después del abono', value: r.paidOff ? 'Crédito saldado' : money(r.newPayment) },
        { label: 'Terminación estimada', value: `${isoText(s(r.baseEndDate))} → ${isoText(s(r.newEndDate))}` },
      ];
    case 'TERM_CHANGE':
      return [
        { label: 'Cuota actual', value: money(r.basePayment) },
        { label: 'Cuota nueva', value: money(r.newPayment) },
        { label: 'Diferencia mensual', value: money(r.paymentDifference) },
        { label: 'Costos del trámite', value: money(r.costs) },
        { label: 'Total a pagar hoy vs nuevo', value: `${money(r.baseTotalCost)} → ${money(r.newTotalCost)}` },
        { label: n(r.totalCostDifference) >= 0 ? 'Costo adicional total' : 'Ahorro total', value: money(Math.abs(n(r.totalCostDifference))) },
      ];
    case 'PORTFOLIO':
      return [
        { label: 'Cuota actual → nueva', value: `${money(r.basePayment)} → ${money(r.newPayment)}` },
        { label: 'Ahorro mensual', value: money(r.monthlySavings) },
        { label: 'Ahorro bruto total', value: money(r.grossSavings) },
        { label: 'Costos del traslado', value: money(r.costs) },
        { label: 'Ahorro neto', value: money(r.netSavings) },
        { label: 'Punto de equilibrio', value: r.breakEvenMonths === null || r.breakEvenMonths === undefined ? 'No se alcanza' : `Mes ${n(r.breakEvenMonths)}` },
        { label: 'Lectura', value: s(r.recommendation) === 'conviene revisar' ? 'Conviene revisar' : 'No parece conveniente' },
      ];
    case 'FREE_EARLY':
      if (!r.feasible) return [{ label: 'Resultado', value: 'Fecha objetivo no alcanzable' }];
      if (r.alreadyOnTrack) return [{ label: 'Resultado', value: `Ya terminas el ${isoText(s(r.baseEndDate))}` }];
      return [
        { label: 'Abono mensual necesario', value: money(r.monthlyExtra) },
        { label: 'Esfuerzo mensual total (cuota + abono)', value: money(r.totalMonthlyEffort) },
        { label: 'Terminación estimada', value: `${isoText(s(r.baseEndDate))} → ${isoText(s(r.newEndDate))}` },
        { label: 'Meses menos de crédito', value: monthsText(n(r.monthsReduced)) },
        { label: 'Intereses que te ahorrarías', value: money(r.interestSaved) },
        { label: 'Total aportado en abonos', value: money(r.totalExtraContributed) },
      ];
    case 'EXTRAORDINARY':
      return [
        { label: 'Terminación estimada', value: `${isoText(s(r.baseEndDate))} → ${isoText(s(r.newEndDate))}` },
        { label: 'Meses menos de crédito', value: monthsText(n(r.monthsReduced)) },
        { label: 'Intereses que te ahorrarías', value: money(r.interestSaved) },
        { label: 'Total aportado en abonos', value: money(r.totalExtraContributed) },
        { label: 'Esfuerzo mensual equivalente', value: money(r.monthlyEquivalentEffort) },
      ];
    case 'TARGET_PAYMENT': {
      const lines = [
        { label: 'Primera cuota (con seguros)', value: money(r.payment) },
        { label: 'Cuota máxima proyectada', value: money(r.maxPayment) },
        { label: 'Límite de cuota / ingreso', value: rateText(n(r.incomeRatioLimit), 0) },
        { label: 'Ingreso mínimo para la primera cuota', value: money(r.minIncome) },
        { label: 'Ingreso mínimo para la cuota máxima', value: money(r.minIncomeAtMaxPayment) },
      ];
      if (r.monthlyIncome !== undefined) {
        lines.push({ label: 'Con tu ingreso', value: r.incomeCovers ? 'Dentro del límite' : 'Por encima del límite' });
      }
      return lines;
    }
    case 'FIXED_VS_UVR': {
      const fixed = (r.fixed ?? {}) as Record<string, unknown>;
      const range = (r.range ?? {}) as Record<string, unknown>;
      const lines = [
        { label: 'Tasa fija: cuota', value: money(fixed.payment) },
        { label: 'Tasa fija: total pagado', value: money(fixed.totalPaid) },
        { label: 'UVR: cuota inicial', value: `${money(range.initialMin)} a ${money(range.initialMax)}` },
        { label: 'UVR: cuota final', value: `${money(range.finalMin)} a ${money(range.finalMax)}` },
        { label: 'UVR: total pagado', value: `${money(range.totalMin)} a ${money(range.totalMax)}` },
      ];
      for (const sc of (r.scenarios ?? []) as Array<Record<string, unknown>>) {
        lines.push({ label: `UVR con inflación ${rateText(n(sc.inflation), 1)}: diferencia vs fija`, value: money(sc.differenceVsFixed) });
      }
      return lines;
    }
    case 'STRESS':
      return [
        { label: 'Nivel de alerta', value: alertText[s(r.alert)] ?? s(r.alert) },
        { label: 'Ingreso en el escenario', value: money(r.stressedIncome) },
        { label: 'Gastos en el escenario (sin cuota)', value: money(r.stressedExpenses) },
        { label: 'Margen mensual', value: money(r.monthlyMargin) },
        { label: 'Cuota / ingreso', value: r.paymentToIncome === null ? 'Sin ingreso' : `${porcentaje(n(r.paymentToIncome) * 100, 0)} %` },
        { label: 'Meses que cubre tu ahorro', value: r.coverageMonths === null ? 'No hay déficit' : `${porcentaje(n(r.coverageMonths), 1)} meses` },
      ];
    case 'RENT_VS_BUY':
      return [
        { label: 'Patrimonio si compras', value: money(r.buyerNetWorth) },
        { label: 'Patrimonio si arriendas', value: money(r.renterNetWorth) },
        { label: 'Diferencia', value: money(r.difference) },
        { label: 'Favorece', value: s(r.favored) === 'COMPRAR' ? 'Comprar' : s(r.favored) === 'ARRENDAR' ? 'Arrendar' : 'Resultado similar' },
      ];
    case 'SALE':
      return [
        { label: 'Gastos de venta', value: money(r.saleCosts) },
        { label: 'Disponible neto', value: money(r.netAvailable) },
      ];
    default:
      return [];
  }
}

/** Parámetros legibles (sin el crédito completo) para PDF y comparación. */
export function describeParams(kind: string, params: Record<string, unknown>): SummaryLine[] {
  const labels: Record<string, [string, 'money' | 'pct' | 'int' | 'date' | 'mode' | 'text' | 'pctlist']> = {
    amount: ['Valor', 'money'],
    date: ['Fecha', 'date'],
    mode: ['Aplicación', 'mode'],
    newTermMonths: ['Plazo nuevo (meses)', 'int'],
    costs: ['Costos', 'money'],
    newRateEa: ['Tasa nueva EA', 'pct'],
    newMonthlyInsurance: ['Seguro mensual nuevo', 'money'],
    targetDate: ['Fecha objetivo', 'date'],
    everyMonths: ['Cada cuántos meses', 'int'],
    principal: ['Monto', 'money'],
    rateEa: ['Tasa EA', 'pct'],
    termMonths: ['Plazo (meses)', 'int'],
    monthlyInsurance: ['Seguro mensual', 'money'],
    system: ['Sistema', 'text'],
    inflation: ['Inflación supuesta', 'pct'],
    incomeRatioLimit: ['Límite cuota / ingreso', 'pct'],
    monthlyIncome: ['Ingreso mensual', 'money'],
    rateFixedEa: ['Tasa fija EA', 'pct'],
    rateUvrEa: ['Tasa UVR (real) EA', 'pct'],
    inflations: ['Escenarios de inflación', 'pctlist'],
    monthlyExpenses: ['Gastos mensuales (sin cuota)', 'money'],
    payment: ['Cuota', 'money'],
    savings: ['Ahorros', 'money'],
    incomeDropPct: ['Caída del ingreso', 'pct'],
    newExpense: ['Gasto nuevo mensual', 'money'],
    rent: ['Arriendo mensual', 'money'],
    rentIncreasePct: ['Incremento anual del arriendo', 'pct'],
    price: ['Precio del inmueble', 'money'],
    downPayment: ['Cuota inicial', 'money'],
    appreciationPct: ['Valorización anual', 'pct'],
    maintenancePct: ['Mantenimiento anual (% del valor)', 'pct'],
    horizonYears: ['Horizonte (años)', 'int'],
    opportunityRatePct: ['Rentabilidad alternativa EA', 'pct'],
    loanBalance: ['Saldo del crédito', 'money'],
    saleCostsPct: ['Gastos de venta (% del precio)', 'pct'],
    taxesEstimate: ['Impuestos estimados', 'money'],
  };
  const out: SummaryLine[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const meta = labels[key];
    if (!meta) continue;
    const [label, type] = meta;
    let text: string;
    if (type === 'money') text = pesos(n(value));
    else if (type === 'pct') text = rateText(n(value));
    else if (type === 'int') text = String(n(value));
    else if (type === 'date') text = isoText(s(value));
    else if (type === 'mode') text = value === 'PAYMENT' ? 'Reducir la cuota' : 'Reducir el plazo';
    else if (type === 'pctlist') text = (value as number[]).map((x) => rateText(x, 1)).join(' · ');
    else text = value === 'UVR' ? 'UVR' : value === 'FIXED_PESOS' ? 'Tasa fija en pesos' : String(value);
    out.push({ label, value: text });
  }
  void kind;
  return out;
}

/** Datos del crédito usados, en lenguaje humano. */
export function describeLoan(loan: LoanState | null | undefined): SummaryLine[] {
  if (!loan) return [];
  return [
    { label: 'Saldo de capital', value: `${pesos(loan.balance)} al ${isoText(loan.asOf)}` },
    { label: 'Tasa', value: `${rateText(loan.rateEa)} EA${loan.system === 'UVR' ? ' + UVR' : ''}` },
    { label: 'Cuotas restantes', value: `${loan.remainingMonths} (${monthsText(loan.remainingMonths)})` },
    { label: 'Seguro mensual', value: pesos(loan.monthlyInsurance ?? 0) },
    { label: 'Próxima cuota', value: isoText(loan.nextPaymentDate) },
  ];
}
