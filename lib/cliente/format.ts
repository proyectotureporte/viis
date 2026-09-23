/**
 * Utilidades puras del portal cliente (sin Prisma ni Node): se pueden usar en
 * componentes de servidor y de navegador.
 */
import { addMonths, compareIso, daysInMonth, formatIsoDate, parseIsoDate } from '@/lib/finance/dates';
import { porcentaje } from '@/lib/formato';

const BOGOTA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fecha de hoy en Bogotá como 'YYYY-MM-DD'. */
export function todayBogota(now: Date = new Date()): string {
  return BOGOTA_DAY.format(now);
}

/** Fecha 'YYYY-MM-DD' de una columna @db.Date (se lee en UTC). */
export function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Fecha 'YYYY-MM-DD' → Date a medianoche UTC, como se guardan las columnas @db.Date. */
export function dbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Día de pago `day` del mes (y, m), ajustado al último día si el mes es más corto. */
function dueIn(y: number, m: number, day: number): string {
  return formatIsoDate({ y, m, d: Math.min(day, daysInMonth(y, m)) });
}

/** Primera fecha con día de pago `day` que sea >= `from` (o > si `strict`). */
export function dueOnOrAfter(from: string, day: number, strict = false): string {
  const { y, m } = parseIsoDate(from);
  const candidate = dueIn(y, m, day);
  const cmp = compareIso(candidate, from);
  if (cmp > 0 || (cmp === 0 && !strict)) return candidate;
  const next = parseIsoDate(addMonths(formatIsoDate({ y, m, d: 1 }), 1));
  return dueIn(next.y, next.m, day);
}

/** Vencimiento anterior al dado, con el mismo día de pago. */
export function previousDue(due: string, day: number): string {
  const prev = parseIsoDate(addMonths(formatIsoDate({ ...parseIsoDate(due), d: 1 }), -1));
  return dueIn(prev.y, prev.m, day);
}

/** "12 años y 4 meses" · "8 meses". */
export function monthsText(months: number): string {
  const total = Math.max(0, Math.round(months));
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const y = years === 1 ? '1 año' : `${years} años`;
  const mo = rest === 1 ? '1 mes' : `${rest} meses`;
  if (years && rest) return `${y} y ${mo}`;
  if (years) return y;
  return mo;
}

/** Fracción → "12,50 %". */
export function rateText(fraction: number, decimals = 2): string {
  return `${porcentaje(fraction * 100, decimals)} %`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM-DD' → "5 oct 2026" (determinístico, sin depender de ICU). */
export function isoText(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const { y, m, d } = parseIsoDate(iso);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  } catch {
    return iso;
  }
}

/** 'YYYY-MM-DD' → "oct 2037". */
export function isoMonthText(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const { y, m } = parseIsoDate(iso);
    return `${MONTHS[m - 1]} ${y}`;
  } catch {
    return iso;
  }
}

/** Texto de porcentaje escrito por el usuario ("12,5") → fracción (0.125). NaN si no es número. */
export function parsePercentInput(text: string): number {
  const clean = text.trim().replace(/\s|%/g, '').replace(',', '.');
  if (clean === '') return NaN;
  return Number(clean) / 100;
}

/** Fracción → texto para un campo ("12,5"). */
export function percentInputText(fraction: number | null | undefined, decimals = 2): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '';
  return String(Number((fraction * 100).toFixed(decimals))).replace('.', ',');
}
