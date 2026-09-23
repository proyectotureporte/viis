/**
 * Matemática de tasas y anualidades (precisión completa, sin redondeo).
 */

/** Efectiva anual → efectiva mensual equivalente: i = (1 + EA)^(1/12) − 1. */
export function monthlyRateFromEa(ea: number): number {
  if (ea === 0) return 0;
  return Math.pow(1 + ea, 1 / 12) - 1;
}

/** Efectiva mensual → efectiva anual: EA = (1 + i)^12 − 1. */
export function eaFromMonthlyRate(i: number): number {
  return Math.pow(1 + i, 12) - 1;
}

/** Cuota fija del sistema francés: A = P·i / (1 − (1+i)^−n). Con i = 0, A = P/n. */
export function annuityPayment(principal: number, i: number, n: number): number {
  if (n <= 0) throw new RangeError('El número de cuotas debe ser positivo');
  if (i === 0) return principal / n;
  return (principal * i) / (1 - Math.pow(1 + i, -n));
}

/**
 * Número de cuotas para pagar P con cuota A: n = −ln(1 − P·i/A) / ln(1+i).
 * Infinity si la cuota no cubre ni el interés del periodo.
 */
export function numberOfPayments(principal: number, i: number, payment: number): number {
  if (principal <= 0) return 0;
  if (payment <= 0) return Infinity;
  if (i === 0) return principal / payment;
  const ratio = (principal * i) / payment;
  if (ratio >= 1) return Infinity;
  return -Math.log(1 - ratio) / Math.log(1 + i);
}

/** Redondeo a `decimals` decimales, simétrico (half away from zero) y estable ante 0.1+0.2. */
export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  // toPrecision(15) elimina el ruido binario (1.005·100 = 100.49999…) antes de redondear.
  const scaled = Number((Math.abs(value) * f).toPrecision(15));
  return (Math.sign(value) * Math.round(scaled)) / f || 0;
}

/** Redondeo a centavos. */
export const toCents = (value: number): number => roundTo(value, 2);
