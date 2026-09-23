/**
 * Utilidades de la consola empresa para leer parámetros de URL y trabajar
 * fechas en la zona horaria de operación (America/Bogota, UTC−5 sin horario de verano).
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro de búsqueda, recortado. */
export function sp(params: SearchParams, key: string): string {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? '').trim().slice(0, 200);
}

/** Valor permitido de una lista o cadena vacía. */
export function spEnum<T extends string>(params: SearchParams, key: string, allowed: readonly T[]): T | '' {
  const value = sp(params, key);
  return (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

export function spUuid(params: SearchParams, key: string): string {
  const value = sp(params, key);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : '';
}

export function spPage(params: SearchParams, key = 'p'): number {
  const n = Number(sp(params, key));
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : 1;
}

export function spDate(params: SearchParams, key: string): string {
  const value = sp(params, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : '';
}

/** Construye un query string conservando filtros y reemplazando algunos valores. */
export function qs(base: Record<string, string | number | undefined | null>, patch: Record<string, string | number | undefined | null> = {}): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    if (v !== undefined && v !== null && String(v) !== '') out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : '';
}

// ── Fechas en Bogotá ────────────────────────────────────────────────────

const BOGOTA_OFFSET_MS = 5 * 3_600_000;

/** 'YYYY-MM-DD' de hoy en Bogotá. */
export function todayBogota(now = new Date()): string {
  return new Date(now.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante (UTC) en que empieza el día `ymd` en Bogotá. */
export function bogotaDayStart(ymd: string): Date {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + BOGOTA_OFFSET_MS);
}

/** Instante (UTC) en que termina (exclusivo) el día `ymd` en Bogotá. */
export function bogotaDayEnd(ymd: string): Date {
  return new Date(bogotaDayStart(ymd).getTime() + 86_400_000);
}

/** Primer día del mes en curso en Bogotá, como instante UTC. */
export function bogotaMonthStart(now = new Date()): Date {
  return bogotaDayStart(`${todayBogota(now).slice(0, 7)}-01`);
}

/** Fecha @db.Date para Prisma a partir de 'YYYY-MM-DD'. */
export function dbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

export function addDaysYmd(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Nombre del mes en curso en Bogotá ("septiembre de 2026"). */
export function monthLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(now);
}

/** Rango de fechas (Bogotá) de los filtros; por defecto los últimos `defaultDays` días. */
export function dateRange(params: SearchParams, defaultDays = 90): { from: string; to: string; start: Date; end: Date } {
  const today = todayBogota();
  let to = spDate(params, 'hasta') || today;
  let from = spDate(params, 'desde') || addDaysYmd(to, -(defaultDays - 1));
  if (from > to) [from, to] = [to, from];
  return { from, to, start: bogotaDayStart(from), end: bogotaDayEnd(to) };
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Escapa un valor para CSV (RFC 4180) y neutraliza fórmulas al abrir en hojas de cálculo. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}
