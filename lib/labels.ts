import type { Stage } from '@/app/generated/prisma/enums';
import { pesos, porcentaje } from './formato';

/** Textos humanos y formatos de presentación compartidos por los tres portales. */

export const STAGES: Stage[] = ['LEAD', 'CONTACTED', 'PROFILED', 'DOCUMENTING', 'FILED', 'APPROVED', 'SIGNED', 'DISBURSED', 'POSTSALE', 'WITHDRAWN'];
export const PIPELINE_STAGES: Stage[] = ['LEAD', 'CONTACTED', 'PROFILED', 'DOCUMENTING', 'FILED', 'APPROVED', 'SIGNED', 'DISBURSED'];

export const STAGE_LABELS: Record<Stage, string> = {
  LEAD: 'Lead',
  CONTACTED: 'Contactado',
  PROFILED: 'Perfilado',
  DOCUMENTING: 'Documentando',
  FILED: 'Radicado',
  APPROVED: 'Aprobado',
  SIGNED: 'Firmado',
  DISBURSED: 'Desembolsado',
  WITHDRAWN: 'Desistido',
  POSTSALE: 'Posventa',
};

/** Qué significa cada etapa para el cliente, en lenguaje simple. */
export const STAGE_CLIENT_TEXT: Record<Stage, string> = {
  LEAD: 'Recibimos tu solicitud y un asesor te contactará.',
  CONTACTED: 'Ya hablamos contigo; estamos entendiendo tu caso.',
  PROFILED: 'Tenemos tu perfil; ahora necesitamos tus documentos.',
  DOCUMENTING: 'Estamos reuniendo y validando tus documentos.',
  FILED: 'Tu solicitud fue radicada ante la entidad. Esperamos su respuesta.',
  APPROVED: 'La entidad aprobó tu solicitud. Revisa las condiciones.',
  SIGNED: 'Firmaste. Estamos coordinando el desembolso.',
  DISBURSED: 'El crédito fue desembolsado. Empieza tu acompañamiento.',
  WITHDRAWN: 'La solicitud se cerró sin continuar.',
  POSTSALE: 'Tu crédito está activo y te acompañamos.',
};

/** SLA por etapa en horas hábiles aproximadas (parámetro operativo). */
export const STAGE_SLA_HOURS: Partial<Record<Stage, number>> = {
  LEAD: 24,
  CONTACTED: 72,
  PROFILED: 72,
  DOCUMENTING: 120,
  FILED: 120,
  APPROVED: 96,
  SIGNED: 120,
};

export const PRODUCTS: Record<string, string> = {
  NEW_LOAN: 'Crédito nuevo',
  PORTFOLIO_PURCHASE: 'Compra de cartera',
  TERM_CHANGE: 'Cambio de plazo o condición',
  RATE_REVIEW: 'Revisión de tasa',
  PREPAYMENT_PLAN: 'Plan de abonos',
  INSURANCE_CLAIM: 'Reclamación de seguro',
  ADVISORY: 'Asesoría patrimonial',
};

export const DOC_STATUS: Record<string, { label: string; tone: string }> = {
  UPLOADED: { label: 'Cargado', tone: 'info' },
  IN_REVIEW: { label: 'En revisión', tone: 'wait' },
  APPROVED: { label: 'Aprobado', tone: 'ok' },
  REJECTED: { label: 'Rechazado', tone: 'bad' },
  EXPIRED: { label: 'Vencido', tone: 'bad' },
  QUARANTINED: { label: 'En verificación antivirus', tone: 'gray' },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: string }> = {
  REPORTED: { label: 'Reportado', tone: 'info' },
  IN_REVIEW: { label: 'En revisión', tone: 'wait' },
  VALIDATED: { label: 'Validado', tone: 'ok' },
  REJECTED: { label: 'Rechazado', tone: 'bad' },
  RECONCILED: { label: 'Conciliado', tone: 'ok' },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: string }> = {
  OPEN: { label: 'Abierta', tone: 'info' },
  IN_PROGRESS: { label: 'En gestión', tone: 'wait' },
  WAITING_CLIENT: { label: 'Esperando tu respuesta', tone: 'wait' },
  RESOLVED: { label: 'Resuelta', tone: 'ok' },
  REJECTED: { label: 'No procedente', tone: 'bad' },
};

export const REQUEST_KINDS: Record<string, { label: string; slaHours: number }> = {
  ADVISOR: { label: 'Hablar con un asesor', slaHours: 24 },
  TERM_CHANGE: { label: 'Cambio de plazo o cuota', slaHours: 72 },
  PREPAYMENT: { label: 'Aplicación de un abono', slaHours: 48 },
  PORTFOLIO: { label: 'Estudio de compra de cartera', slaHours: 72 },
  DATA_UPDATE: { label: 'Actualizar mis datos', slaHours: 48 },
  DOCUMENT: { label: 'Certificados o documentos', slaHours: 72 },
  HARDSHIP: { label: 'Tengo dificultades para pagar', slaHours: 24 },
  PQR: { label: 'Petición, queja o reclamo (PQR)', slaHours: 360 },
  PRIVACY: { label: 'Mis datos personales (habeas data)', slaHours: 240 },
};

export const COMMISSION_STATUS: Record<string, { label: string; tone: string }> = {
  CAUSED: { label: 'Causada', tone: 'info' },
  APPROVED: { label: 'Aprobada', tone: 'wait' },
  SCHEDULED: { label: 'Pago programado', tone: 'wait' },
  PAID: { label: 'Pagada', tone: 'ok' },
  REVERSED: { label: 'Reversada', tone: 'bad' },
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmado',
  ESTIMATED: 'Estimado',
  DECLARED: 'Declarado',
};

export const PRIORITY_LABELS: Record<string, { label: string; tone: string }> = {
  LOW: { label: 'Baja', tone: 'gray' },
  NORMAL: { label: 'Normal', tone: 'ok' },
  HIGH: { label: 'Alta', tone: 'wait' },
  CRITICAL: { label: 'Crítica', tone: 'bad' },
};

export const DOCUMENT_TYPES_ID: Record<string, string> = { CC: 'Cédula de ciudadanía', CE: 'Cédula de extranjería', PA: 'Pasaporte', NIT: 'NIT', PPT: 'Permiso por protección temporal' };

// ── Formatos ─────────────────────────────────────────────────────────────

export function toNumber(value: bigint | number | string | { toString(): string } | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

/** `$428,0 M` para cifras grandes, `$2.847.000` para el resto. */
export function money(value: bigint | number | null | undefined, compact = false): string {
  const n = toNumber(value);
  if (compact && Math.abs(n) >= 1_000_000_000) return `$${porcentaje(n / 1_000_000_000, 2)} mil M`;
  if (compact && Math.abs(n) >= 1_000_000) return `$${porcentaje(n / 1_000_000, 1)} M`;
  return pesos(n);
}

export function pct(value: number, decimals = 1): string {
  return `${porcentaje(value * 100, decimals)}%`;
}

const DATE = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' });
const DATETIME = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
const DATE_UTC = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });

export function fecha(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return DATE.format(new Date(value));
}

/** Para columnas `@db.Date` (sin hora): se leen en UTC para no correr un día. */
export function fechaDia(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return DATE_UTC.format(new Date(value));
}

export function fechaHora(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return DATETIME.format(new Date(value));
}

/** "vence en 2 h 14 min" / "vencido hace 3 h". */
export function slaText(due: Date | null | undefined, now = Date.now()): { text: string; tone: 'ok' | 'wait' | 'bad' } {
  if (!due) return { text: 'Sin SLA', tone: 'ok' };
  const diff = due.getTime() - now;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const span = days > 0 ? `${days} d ${hours} h` : hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
  if (diff < 0) return { text: `Vencido hace ${span}`, tone: 'bad' };
  return { text: span, tone: diff < 8 * 3_600_000 ? 'wait' : 'ok' };
}

export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}
