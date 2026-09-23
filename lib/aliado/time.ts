/**
 * Fechas en hora de Colombia (America/Bogota, UTC−5 todo el año, sin horario
 * de verano). La agenda y los cortes "hoy" / "este mes" se calculan aquí para
 * que el servidor —que corre en UTC— no corra los días.
 */

export const BOGOTA_OFFSET = '-05:00';
const OFFSET_MS = -5 * 3_600_000;
const DAY_MS = 86_400_000;

/** "2026-09-23" en hora de Bogotá. */
export function bogotaYmd(date = new Date()): string {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** "14:30" en hora de Bogotá. */
export function bogotaHm(date: Date): string {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

/** Medianoche de Bogotá del día indicado, como instante UTC. */
export function bogotaDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00${BOGOTA_OFFSET}`);
}

export function addDaysYmd(ymd: string, days: number): string {
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Primer instante del mes en curso (hora de Bogotá). */
export function bogotaMonthStart(date = new Date()): Date {
  return bogotaDayStart(`${bogotaYmd(date).slice(0, 7)}-01`);
}

/** Primer instante del mes anterior (hora de Bogotá). */
export function bogotaPrevMonthStart(date = new Date()): Date {
  const [y, m] = bogotaYmd(date).slice(0, 7).split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return bogotaDayStart(`${prev}-01`);
}

/** Fecha + hora escritas por el usuario (en Bogotá) → instante. */
export function parseBogota(date: string, time: string): Date {
  const value = new Date(`${date}T${time}:00${BOGOTA_OFFSET}`);
  if (Number.isNaN(value.getTime())) throw new Error('Fecha u hora inválida.');
  return value;
}

export function daysBetween(from: Date, to = new Date()): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

const WEEKDAY = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "martes 23 de septiembre" para un YMD (se formatea en UTC a propósito). */
export function dayTitle(ymd: string): string {
  const text = WEEKDAY.format(new Date(`${ymd}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
