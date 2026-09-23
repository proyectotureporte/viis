/**
 * Fechas del portal aliado en hora de Bogotá (UTC−5, sin horario de verano),
 * con la misma regla que usa el servidor para agrupar la agenda.
 */

const OFFSET_MS = 5 * 3_600_000;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function bogota(iso: string): Date {
  return new Date(new Date(iso).getTime() - OFFSET_MS);
}

/** 'YYYY-MM-DD' + n días. */
export function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Día de Bogotá ('YYYY-MM-DD') de un instante ISO. */
export function bogotaDay(iso: string): string {
  return bogota(iso).toISOString().slice(0, 10);
}

/** Hora de Bogotá "HH:MM" (24 h) de un instante ISO, para prellenar formularios. */
export function bogotaHHMM(iso: string): string {
  const d = bogota(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "3:30 p. m." */
export function horaCorta(iso: string): string {
  const d = bogota(iso);
  const h = d.getUTCHours();
  return `${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** "mié 24 sep" para un día 'YYYY-MM-DD'. */
export function diaCorto(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Hora "HH:MM" a etiqueta de 12 h. */
export function etiquetaHora(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Próxima media hora en Bogotá (día y hora) para sugerir en formularios. */
export function proximaMediaHora(): { date: string; time: string } {
  const now = new Date(Date.now() - OFFSET_MS + 30 * 60_000);
  const minutes = now.getUTCMinutes() < 30 ? 30 : 60;
  now.setUTCMinutes(minutes, 0, 0);
  return { date: now.toISOString().slice(0, 10), time: `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}` };
}

/** Franjas de 30 minutos de 6:00 a. m. a 9:30 p. m. */
export const FRANJAS: string[] = Array.from({ length: 32 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/** "36 h" o "2,5 d" para tiempos promedio por etapa. */
export function duracion(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 48) return `${String(hours).replace('.', ',')} h`;
  return `${String(Math.round((hours / 24) * 10) / 10).replace('.', ',')} d`;
}
