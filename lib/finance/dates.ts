/**
 * Fechas de calendario puras sobre texto 'YYYY-MM-DD'. Se evita `Date` con
 * zona horaria: todo se calcula con aritmética de año/mes/día en UTC.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface YMD {
  y: number;
  m: number; // 1..12
  d: number;
}

export function parseIsoDate(iso: string): YMD {
  const match = ISO.exec(iso);
  if (!match) throw new RangeError(`Fecha inválida (se espera YYYY-MM-DD): ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new RangeError(`Fecha inexistente: ${iso}`);
  }
  return { y, m, d };
}

export function formatIsoDate({ y, m, d }: YMD): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Suma meses conservando el día; si el mes destino es más corto se usa su
 * último día (31-ene + 1 mes = 28/29-feb). Para calcular una serie de pagos
 * se suma siempre desde la fecha ancla, así el 31 no "deriva" a 28.
 */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parseIsoDate(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return formatIsoDate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

/** Días reales entre dos fechas (b − a). */
export function actualDays(a: string, b: string): number {
  const pa = parseIsoDate(a);
  const pb = parseIsoDate(b);
  return (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000;
}

/**
 * Días entre dos fechas con la convención 30E/360 (europea): cada mes cuenta
 * 30 días y el día 31 se trata como 30.
 *   días = 360·(y2−y1) + 30·(m2−m1) + (min(d2,30) − min(d1,30))
 */
export function days360(a: string, b: string): number {
  const pa = parseIsoDate(a);
  const pb = parseIsoDate(b);
  return 360 * (pb.y - pa.y) + 30 * (pb.m - pa.m) + (Math.min(pb.d, 30) - Math.min(pa.d, 30));
}

/** Comparación lexicográfica: válida porque el formato es de ancho fijo. */
export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
