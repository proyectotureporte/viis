/**
 * Motor de amortización: sistema francés en pesos y cuota constante en UVR.
 *
 * FÓRMULAS
 *  - Tasa mensual efectiva: i = (1 + EA)^(1/12) − 1.
 *  - Cuota fija (francés): A = P·i / (1 − (1+i)^−n).
 *  - Primer periodo irregular de d días (30E/360): su interés es
 *      I₁ = P·[(1+i)^(d/30) − 1]
 *    y el capital amortizado en la cuota 1 es el de un mes regular
 *    (A − P·i). La primera cuota queda A + (I₁ − P·i): lleva los intereses
 *    de los días adicionales (o descuenta los días faltantes) y desde la
 *    cuota 2 la tabla es idéntica a la regular. Con d = 30, I₁ = P·i.
 *  - UVR (cuota constante en UVR, Ley 546 de 1999): el saldo se lleva en UVR,
 *      saldo₀(UVR) = P / UVR₀
 *    la EA es la tasa REAL sobre UVR y la cuota en UVR es la francesa fija.
 *    La UVR proyectada a t meses del desembolso es
 *      UVR(t) = UVR₀ · (1 + inflación)^(t/12)
 *    y cada valor en pesos de la fila = valor en UVR × UVR(fecha de pago).
 *
 * REDONDEO: el saldo se lleva redondeado a centavos (pesos) o a 6 decimales
 * (UVR) y cada fila se redondea igual, de modo que Σ capital + Σ abonos =
 * saldo inicial exacto. La última cuota absorbe la diferencia.
 */

import { addMonths, compareIso, days360, parseIsoDate } from './dates';
import { annuityPayment, monthlyRateFromEa, numberOfPayments, roundTo, toCents } from './rates';
import type {
  ExtraPayment,
  ExtraPaymentMode,
  LoanInput,
  LoanState,
  Schedule,
  ScheduleRow,
} from './types';
import { ENGINE_VERSION } from './version';

/**
 * Decimales para cantidades en UVR. Con UVR ≈ 400 pesos, 6 decimales son
 * 0,0004 pesos: precisión bajo el centavo, para que el redondeo en UVR no
 * se acumule en la tabla en pesos. El valor de la UVR se muestra con 4.
 */
const UVR_DECIMALS = 6;
const UVR_VALUE_DECIMALS = 4;

export const BASE_ASSUMPTIONS: readonly string[] = [
  'Tasa efectiva mensual equivalente: i = (1 + EA)^(1/12) − 1.',
  'Sistema francés: cuota fija A = P·i / (1 − (1+i)^−n).',
  'Días del primer periodo con convención 30E/360 (cada mes cuenta 30 días; el día 31 se toma como 30). Si la primera cuota cae exactamente un mes después del desembolso, el periodo es regular.',
  'Primer periodo irregular de d días: interés = saldo · [(1+i)^(d/30) − 1]. La primera cuota amortiza el mismo capital que un mes regular y suma (o resta) el interés de los días de diferencia; desde la segunda cuota la tabla es la regular.',
  'Las cuotas vencen mensualmente el mismo día del desembolso (o de la primera cuota, si se indica una irregular); si el mes no tiene ese día, se usa el último día del mes.',
  'Seguro de vida (si aplica) = tasa mensual × saldo inicial del periodo; seguro fijo mensual en pesos. Se cobran completos en cada cuota, también en un primer periodo irregular.',
  'Abonos extraordinarios: se aplican a capital al cierre del periodo cuya fecha de pago es igual o posterior a la fecha del abono. TERM mantiene la cuota y reduce el plazo; PAYMENT recalcula la cuota con el plazo restante.',
  'Valores de cada fila redondeados a centavos; la última cuota se ajusta para dejar el saldo exactamente en cero.',
];

export const UVR_ASSUMPTIONS: readonly string[] = [
  'UVR: sistema de cuota constante en UVR. El saldo y la cuota se calculan en UVR con la tasa real (EA sobre UVR).',
  'UVR proyectada: UVR(t) = UVR₀ · (1 + inflación anual)^(t/12), con t en meses (30E/360) desde el desembolso. Es una proyección, no un valor oficial del Banco de la República.',
  'Los valores en pesos de cada fila son el valor en UVR multiplicado por la UVR proyectada en la fecha de pago; el saldo en pesos crece con la UVR (corrección monetaria).',
];

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} debe ser un número finito`);
}

function validate(input: LoanInput): void {
  assertFinite(input.principal, 'principal');
  if (input.principal <= 0) throw new RangeError('El capital debe ser mayor que cero');
  assertFinite(input.rateEa, 'rateEa');
  if (input.rateEa <= -1) throw new RangeError('La tasa EA debe ser mayor que −100 %');
  if (!Number.isInteger(input.termMonths) || input.termMonths < 1) {
    throw new RangeError('El plazo debe ser un número entero de meses ≥ 1');
  }
  parseIsoDate(input.startDate);
  if (input.firstPaymentDate) parseIsoDate(input.firstPaymentDate);
  if ((input.monthlyInsurance ?? 0) < 0 || (input.insuranceRateMonthly ?? 0) < 0) {
    throw new RangeError('Los seguros no pueden ser negativos');
  }
  if (input.system === 'UVR') {
    if (!input.uvr) throw new RangeError('El sistema UVR requiere uvr { initialValue, annualInflation }');
    assertFinite(input.uvr.initialValue, 'uvr.initialValue');
    assertFinite(input.uvr.annualInflation, 'uvr.annualInflation');
    if (input.uvr.initialValue <= 0) throw new RangeError('El valor inicial de la UVR debe ser positivo');
    if (input.uvr.annualInflation <= -1) throw new RangeError('La inflación debe ser mayor que −100 %');
  }
  for (const e of input.extraPayments ?? []) {
    parseIsoDate(e.date);
    assertFinite(e.amount, 'extraPayments.amount');
    if (e.amount < 0) throw new RangeError('Un abono no puede ser negativo');
  }
  const r = input.recurringExtra;
  if (r) {
    parseIsoDate(r.startDate);
    assertFinite(r.amount, 'recurringExtra.amount');
    if (r.amount < 0) throw new RangeError('Un abono no puede ser negativo');
    if (!Number.isInteger(r.everyMonths) || r.everyMonths < 1) {
      throw new RangeError('recurringExtra.everyMonths debe ser un entero ≥ 1');
    }
  }
}

/** Fecha de la cuota k (1-based), anclada en la primera para no perder el día 31. */
export function paymentDate(firstPaymentDate: string, k: number): string {
  return addMonths(firstPaymentDate, k - 1);
}

/** Expande el abono recurrente en abonos puntuales hasta `lastDate` (incluida). */
function expandRecurring(input: LoanInput, lastDate: string): ExtraPayment[] {
  const r = input.recurringExtra;
  if (!r || r.amount <= 0) return [];
  const out: ExtraPayment[] = [];
  for (let j = 0; ; j++) {
    const date = addMonths(r.startDate, j * r.everyMonths);
    if (compareIso(date, lastDate) > 0) break;
    out.push({ date, amount: r.amount, mode: r.mode });
  }
  return out;
}

/**
 * Genera la tabla de amortización completa.
 */
export function amortize(input: LoanInput): Schedule {
  validate(input);
  const isUvr = input.system === 'UVR';
  const n = input.termMonths;
  const i = monthlyRateFromEa(input.rateEa);
  const round = (x: number) => roundTo(x, isUvr ? UVR_DECIMALS : 2);

  // Primer periodo: regular si la primera cuota cae a un mes exacto del desembolso.
  const defaultFirst = addMonths(input.startDate, 1);
  const firstPaymentDate = input.firstPaymentDate ?? defaultFirst;
  // Serie de fechas anclada en el día original (desembolso o primera cuota) para no perder el 31.
  const dateOf = (k: number) =>
    firstPaymentDate !== defaultFirst ? paymentDate(firstPaymentDate, k) : addMonths(input.startDate, k);
  const firstPeriodDays = firstPaymentDate === defaultFirst ? 30 : days360(input.startDate, firstPaymentDate);
  if (firstPeriodDays <= 0) throw new RangeError('La primera cuota debe ser posterior al desembolso');
  const firstRate = Math.pow(1 + i, firstPeriodDays / 30) - 1;

  const uvr0 = input.uvr?.initialValue ?? 1;
  const inflation = input.uvr?.annualInflation ?? 0;
  /** UVR en la fecha de la cuota k: t = d₁/30 + (k − 1) meses desde el desembolso. */
  const uvrAt = (k: number) => uvr0 * Math.pow(1 + inflation, (firstPeriodDays / 30 + (k - 1)) / 12);

  const warnings: string[] = [];
  const assumptions = [...BASE_ASSUMPTIONS, ...(isUvr ? UVR_ASSUMPTIONS : [])];

  // Abonos ordenados por fecha; los anteriores o iguales al desembolso se descartan.
  const lastPossible = dateOf(n);
  const extras = [...(input.extraPayments ?? []), ...expandRecurring(input, lastPossible)]
    .filter((e) => e.amount > 0)
    .sort((a, b) => compareIso(a.date, b.date));
  const pending: ExtraPayment[] = [];
  for (const e of extras) {
    if (compareIso(e.date, input.startDate) <= 0) {
      warnings.push(`Abono del ${e.date} ignorado: es anterior o igual al desembolso.`);
    } else {
      pending.push(e);
    }
  }

  // Saldo en unidades (pesos o UVR) y cuota nivelada A (interés + capital).
  let balance = round(input.principal / (isUvr ? uvr0 : 1));
  let level = round(annuityPayment(balance, i, n));
  let plannedEnd = n;

  const rows: ScheduleRow[] = [];
  let cursor = 0; // índice en `pending`
  for (let k = 1; balance > 0 && k <= n; k++) {
    const date = dateOf(k);
    const u = isUvr ? uvrAt(k) : 1;

    const opening = balance;
    // El capital se amortiza siempre con el interés de un mes regular; en la
    // cuota 1 el interés cobrado es el del periodo real (más o menos días).
    const regularInterestU = round(opening * i);
    const interestU = k === 1 ? round(opening * firstRate) : regularInterestU;
    const isLast = k >= plannedEnd || level - regularInterestU >= opening;
    let principalU = isLast ? opening : round(level - regularInterestU);
    if (principalU < 0) {
      // La cuota no cubre el interés: no se permite amortización negativa en este motor.
      warnings.push(`La cuota ${k} no cubre el interés del periodo; se cobra solo interés.`);
      principalU = 0;
    }
    let after = round(opening - principalU);

    // Abonos que caen en este periodo (fecha ≤ fecha de pago).
    let extraU = 0;
    let lastMode: ExtraPaymentMode | null = null;
    while (cursor < pending.length && compareIso(pending[cursor].date, date) <= 0) {
      const e = pending[cursor++];
      if (after <= 0) {
        warnings.push(`Abono del ${e.date} no aplicado: el crédito ya quedó saldado.`);
        continue;
      }
      const applied = Math.min(after, round(e.amount / u));
      if (applied < round(e.amount / u)) {
        warnings.push(`El abono del ${e.date} supera el saldo; solo se aplica lo necesario para saldar el crédito.`);
      }
      extraU = round(extraU + applied);
      after = round(after - applied);
      lastMode = e.mode;
    }

    // Tras un abono se reprograma según la modalidad del último abono del periodo.
    if (lastMode && after > 0) {
      if (lastMode === 'TERM') {
        plannedEnd = k + Math.ceil(numberOfPayments(after, i, level) - 1e-9);
      } else {
        level = round(annuityPayment(after, i, plannedEnd - k));
      }
    }

    const openingBalance = toCents(opening * u);
    const interest = toCents(interestU * u);
    const principal = toCents(principalU * u);
    const extra = toCents(extraU * u);
    const insurance = toCents((input.monthlyInsurance ?? 0) + (input.insuranceRateMonthly ?? 0) * openingBalance);
    const row: ScheduleRow = {
      n: k,
      date,
      openingBalance,
      interest,
      principal,
      insurance,
      extra,
      payment: toCents(interest + principal + insurance),
      closingBalance: toCents(after * u),
    };
    if (isUvr) {
      row.uvrValue = roundTo(u, UVR_VALUE_DECIMALS);
      row.paymentUvr = round(interestU + principalU);
      row.closingBalanceUvr = after;
    }
    rows.push(row);
    balance = after;
  }

  for (; cursor < pending.length; cursor++) {
    warnings.push(`Abono del ${pending[cursor].date} no aplicado: es posterior a la última cuota.`);
  }

  const sum = (f: (r: ScheduleRow) => number) => toCents(rows.reduce((acc, r) => acc + f(r), 0));
  const totals = {
    interest: sum((r) => r.interest),
    insurance: sum((r) => r.insurance),
    principal: sum((r) => r.principal),
    extra: sum((r) => r.extra),
    paid: sum((r) => r.payment + r.extra),
  };

  return {
    rows,
    totals,
    payoffDate: rows[rows.length - 1].date,
    months: rows.length,
    basePayment: rows[0].payment,
    monthlyRate: i,
    firstPeriodDays,
    assumptions,
    warnings,
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * Convierte el estado actual de un crédito en un LoanInput que amortiza el
 * saldo restante: capital = saldo, plazo = cuotas restantes, desembolso = asOf.
 */
export function remainingLoanInput(state: LoanState): LoanInput {
  let uvr = state.uvr;
  if (state.system === 'UVR' && state.uvr) {
    // UVR a la fecha de corte: la informada o la proyectada desde el desembolso.
    const months = days360(state.startDate, state.asOf) / 30;
    const valueAtAsOf =
      state.uvrAtAsOf ?? state.uvr.initialValue * Math.pow(1 + state.uvr.annualInflation, months / 12);
    uvr = { initialValue: valueAtAsOf, annualInflation: state.uvr.annualInflation };
  }
  return {
    principal: state.balance,
    rateEa: state.rateEa,
    termMonths: state.remainingMonths,
    system: state.system,
    monthlyInsurance: state.monthlyInsurance,
    insuranceRateMonthly: state.insuranceRateMonthly,
    startDate: state.asOf,
    firstPaymentDate: state.nextPaymentDate,
    uvr,
    extraPayments: (state.extraPayments ?? []).filter((e) => compareIso(e.date, state.asOf) > 0),
    recurringExtra: advanceRecurring(state),
  };
}

/** Mueve el inicio del abono recurrente a su primera ocurrencia posterior a asOf. */
function advanceRecurring(state: LoanState): LoanInput['recurringExtra'] {
  const r = state.recurringExtra;
  if (!r || r.everyMonths < 1) return r;
  let j = 0;
  while (compareIso(addMonths(r.startDate, j * r.everyMonths), state.asOf) <= 0) j++;
  return { ...r, startDate: addMonths(r.startDate, j * r.everyMonths) };
}

/** Cronograma restante desde el saldo actual. */
export function remainingSchedule(state: LoanState): Schedule {
  const schedule = amortize(remainingLoanInput(state));
  schedule.assumptions.push(
    `Cronograma restante calculado desde el saldo al ${state.asOf} con ${state.remainingMonths} cuotas; puede diferir unos pesos del extracto del banco por su propio redondeo y fechas de corte.`,
  );
  return schedule;
}
