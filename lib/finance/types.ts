/**
 * Tipos del motor financiero.
 *
 * Convenciones:
 *  - Montos en pesos colombianos como `number`. La tabla se redondea a
 *    centavos fila por fila (el redondeo al peso es SOLO de presentación).
 *  - Tasas y porcentajes como FRACCIÓN: 0.12 = 12 %. Los campos `*Pct`
 *    también son fracciones (0.05 = 5 %).
 *  - Fechas como texto ISO 'YYYY-MM-DD' (sin hora ni zona horaria).
 */

export type AmortizationSystem = 'FIXED_PESOS' | 'UVR';

/** TERM: mantiene la cuota y reduce el plazo. PAYMENT: mantiene el plazo y baja la cuota. */
export type ExtraPaymentMode = 'TERM' | 'PAYMENT';

export interface ExtraPayment {
  /** Fecha del abono 'YYYY-MM-DD'. Se aplica en el periodo cuya fecha de pago es >= a esta. */
  date: string;
  /** Monto en pesos. */
  amount: number;
  mode: ExtraPaymentMode;
}

export interface RecurringExtra {
  amount: number;
  /** Cada cuántos meses se repite (1 = mensual, 12 = anual). */
  everyMonths: number;
  /** Fecha del primer abono 'YYYY-MM-DD'. */
  startDate: string;
  mode: ExtraPaymentMode;
}

export interface UvrProjection {
  /** Valor de la UVR en la fecha de desembolso (startDate), en pesos. */
  initialValue: number;
  /** Inflación anual proyectada (fracción). La UVR sigue la variación del IPC. */
  annualInflation: number;
}

export interface LoanInput {
  principal: number;
  /** Tasa efectiva anual (fracción). En UVR es la tasa REAL, adicional a la UVR. */
  rateEa: number;
  termMonths: number;
  system: AmortizationSystem;
  /** Seguro fijo mensual en pesos (p. ej. incendio y terremoto). */
  monthlyInsurance?: number;
  /** Seguro de vida sobre saldo: fracción mensual aplicada al saldo inicial del periodo. */
  insuranceRateMonthly?: number;
  /** Fecha de desembolso 'YYYY-MM-DD'. */
  startDate: string;
  /** Fecha de la primera cuota. Por defecto, un mes después del desembolso. */
  firstPaymentDate?: string;
  /** Requerido si system === 'UVR'. */
  uvr?: UvrProjection;
  extraPayments?: ExtraPayment[];
  recurringExtra?: RecurringExtra;
}

export interface ScheduleRow {
  /** Número de cuota (1..n). */
  n: number;
  date: string;
  openingBalance: number;
  interest: number;
  principal: number;
  insurance: number;
  extra: number;
  /** Cuota del periodo SIN abono extraordinario: interés + capital + seguros. */
  payment: number;
  closingBalance: number;
  /** Solo UVR: valor de la UVR proyectada en la fecha de pago. */
  uvrValue?: number;
  /** Solo UVR: cuota (interés + capital) expresada en UVR. */
  paymentUvr?: number;
  /** Solo UVR: saldo final expresado en UVR. */
  closingBalanceUvr?: number;
}

export interface ScheduleTotals {
  interest: number;
  insurance: number;
  principal: number;
  extra: number;
  /** Todo lo pagado: cuotas (con seguros) + abonos. */
  paid: number;
}

export interface Schedule {
  rows: ScheduleRow[];
  totals: ScheduleTotals;
  payoffDate: string;
  months: number;
  /** Cuota inicial con seguros (primera fila). */
  basePayment: number;
  /** Tasa efectiva mensual usada (real en UVR). */
  monthlyRate: number;
  /** Días del primer periodo bajo 30E/360. */
  firstPeriodDays: number;
  assumptions: string[];
  warnings: string[];
  engineVersion: string;
}

/**
 * Estado actual de un crédito ya en curso. Los campos de LoanInput describen
 * el crédito original; balance/remainingMonths/asOf describen el presente.
 */
export interface LoanState extends LoanInput {
  /** Saldo de capital a la fecha asOf, en pesos. */
  balance: number;
  /** Cuotas que faltan. */
  remainingMonths: number;
  /** Fecha de corte del saldo 'YYYY-MM-DD' (se toma como la última fecha de pago). */
  asOf: string;
  /** Próxima fecha de pago. Por defecto, asOf + 1 mes. */
  nextPaymentDate?: string;
  /** Solo UVR: valor de la UVR a la fecha asOf. Si falta, se proyecta desde uvr.initialValue. */
  uvrAtAsOf?: number;
}

/** Costos como total o desglosados por concepto (estudio, avalúo, notariales...). */
export type Costs = number | Record<string, number>;

export interface SimulationResult<I, R> {
  inputs: I;
  results: R;
  assumptions: string[];
  warnings: string[];
  engineVersion: string;
}
