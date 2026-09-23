import type { NotificationView, SlaView, StatusLabel } from './contract';
import { slaText } from '@/lib/labels';
import { ApiError } from './http';

/** Utilidades de serialización y parámetros de la API móvil. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IdContext = { params: Promise<{ id: string }> };
export type SlugContext = { params: Promise<{ slug: string }> };

/** Id de la ruta: si no es un uuid, 404 sin consultar la base de datos. */
export async function idParam(ctx: IdContext): Promise<string> {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError('No encontrado.', 404);
  return id;
}

export async function slugParam(ctx: SlugContext): Promise<string> {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new ApiError('No encontrado.', 404);
  return slug;
}

/** Columna @db.Date → 'YYYY-MM-DD'. */
export function day(value: Date): string;
export function day(value: Date | null | undefined): string | null;
export function day(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Instante → ISO 8601 (UTC). */
export function iso(value: Date): string;
export function iso(value: Date | null | undefined): string | null;
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** BigInt/Decimal → number (null se conserva). */
export function num(value: bigint | number | { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value.toString());
}

/** Monto calculado por el motor (centavos) → pesos enteros. */
export function pesosInt(value: number): number {
  return Math.round(value);
}

export function statusOf(map: Record<string, { label: string; tone: string }>, code: string): StatusLabel {
  const entry = map[code];
  return { code, label: entry?.label ?? code, tone: entry?.tone ?? 'gray' };
}

export function slaOf(due: Date | null | undefined, now = Date.now()): SlaView | null {
  if (!due) return null;
  const s = slaText(due, now);
  return { dueAt: due.toISOString(), overdue: due.getTime() < now, text: s.text, tone: s.tone };
}

export function notificationView(n: { id: string; title: string; body: string; href: string | null; readAt: Date | null; createdAt: Date }): NotificationView {
  return { id: n.id, title: n.title, body: n.body, href: n.href, readAt: iso(n.readAt), createdAt: n.createdAt.toISOString() };
}

/** Fija campos del formulario desde la ruta (prevalecen sobre lo que envíe el cuerpo). */
export function withFields(form: FormData, fields: Record<string, string>): FormData {
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

/** Entero positivo de la URL (?pagina=2) o el valor por defecto. */
export function intParam(url: URL, name: string, fallback = 1, max = 10_000): number {
  const raw = Number(url.searchParams.get(name) ?? '');
  return Number.isInteger(raw) && raw >= 1 && raw <= max ? raw : fallback;
}
