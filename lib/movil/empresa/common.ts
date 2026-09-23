import type { Role } from '@/app/generated/prisma/enums';
import { activeStaff } from '@/lib/empresa/access';
import { sp, spPage, type SearchParams } from '@/lib/empresa/params';
import { appUrl } from '@/lib/mail';
import { ApiError, bodyAsForm } from '@/lib/movil/http';
import { CONFIDENCE_LABELS, DOC_STATUS, DOCUMENT_TYPES_ID, PRIORITY_LABELS, PRODUCTS, slaText, STAGE_LABELS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { caseScope, ROLE_LABELS, STAFF_ROLES } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import { LINK_TTL_MS, temporaryDocumentUrl } from '@/lib/storage';
import type {
  DocumentLinkResponse,
  DocumentVersionView,
  LabelView,
  LoanView,
  OptionView,
  PageInfo,
  PropertyView,
  SlaView,
  StaffOption,
  StaffRole,
  Tone,
} from '@/lib/movil/contract-empresa';

/** Utilidades compartidas de la API móvil de la consola empresa. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TONES: Tone[] = ['ok', 'info', 'wait', 'bad', 'gray'];

export type RouteCtx<K extends string = 'id'> = { params: Promise<Record<K, string>> };

/** Parámetro uuid de la ruta; si no es uuid → 404 sin consultar la BD. */
export async function routeId<K extends string = 'id'>(ctx: RouteCtx<K>, key: K = 'id' as K): Promise<string> {
  const value = (await ctx.params)[key];
  if (!value || !UUID.test(value)) throw new ApiError('No encontrado.', 404);
  return value;
}

/** Querystring → mismo formato que `searchParams` de las páginas web. */
export function paramsOf(request: Request): SearchParams {
  const out: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((value, key) => {
    if (!(key in out)) out[key] = value;
  });
  return out;
}

/** `?pagina=N` (móvil) o `?p=N` (web). */
export function pageParam(params: SearchParams): number {
  return sp(params, 'pagina') ? spPage(params, 'pagina') : spPage(params, 'p');
}

export function pageInfo(page: number, pageSize: number, total: number): PageInfo {
  return { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function iso(value: Date): string;
export function iso(value: Date | null | undefined): string | null;
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Columna @db.Date → 'YYYY-MM-DD'. */
export function day(value: Date): string;
export function day(value: Date | null | undefined): string | null;
export function day(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function num(value: bigint | number | { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

export function tone(value: string | undefined): Tone {
  return TONES.includes(value as Tone) ? (value as Tone) : 'gray';
}

export function labelOf(map: Record<string, { label: string; tone: string }>, code: string): LabelView {
  const entry = map[code];
  return { code, label: entry?.label ?? code, tone: tone(entry?.tone) };
}

export function plainLabel(map: Record<string, string>, code: string, t: Tone = 'gray'): LabelView {
  return { code, label: map[code] ?? code, tone: t };
}

export function options(map: Record<string, string>): OptionView[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

export const CHANNEL_LABELS: Record<string, string> = { DIRECTO: 'Directo', ALIADO: 'Aliado', WEB: 'Web' };
export const SYSTEM_LABELS: Record<string, string> = { FIXED_PESOS: 'Pesos, cuota fija', UVR: 'UVR' };

export const stageLabel = (code: string): LabelView => ({
  code,
  label: STAGE_LABELS[code as keyof typeof STAGE_LABELS] ?? code,
  tone: code === 'WITHDRAWN' ? 'gray' : code === 'DISBURSED' || code === 'POSTSALE' ? 'ok' : 'info',
});
export const priorityLabel = (code: string): LabelView => labelOf(PRIORITY_LABELS, code);
export const productLabel = (code: string): LabelView => plainLabel(PRODUCTS, code, 'info');
export const channelLabel = (code: string): LabelView => plainLabel(CHANNEL_LABELS, code, 'info');
export const confidenceLabel = (code: string): LabelView => plainLabel(CONFIDENCE_LABELS, code, code === 'CONFIRMED' ? 'ok' : code === 'ESTIMATED' ? 'wait' : 'info');
export const documentTypeLabel = (code: string): LabelView => plainLabel(DOCUMENT_TYPES_ID, code);
export const roleLabel = (role: string): string => ROLE_LABELS[role as Role] ?? role;

export function slaView(due: Date | null | undefined, now = Date.now()): SlaView | null {
  if (!due) return null;
  const s = slaText(due, now);
  return { dueAt: due.toISOString(), overdue: due.getTime() < now, text: s.text, tone: s.tone };
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Personal interno activo como opciones (mismo listado que la web). */
export async function staffOptions(roles: Role[] = STAFF_ROLES): Promise<StaffOption[]> {
  const staff = await activeStaff(roles);
  return staff.map((s) => ({ id: s.id, name: s.name, role: s.role as StaffRole, roleLabel: roleLabel(s.role) }));
}

export async function entityOptions(): Promise<OptionView[]> {
  const rows = await getPrisma().entity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return rows.map((e) => ({ value: e.id, label: e.name }));
}

/** Nombres de usuarios por id (para autores, revisores y actores). */
export async function userNames(ids: Iterable<string | null | undefined>): Promise<Map<string, { name: string; email: string; role: string }>> {
  const list = [...new Set([...ids].filter((v): v is string => Boolean(v)))];
  if (!list.length) return new Map();
  const users = await getPrisma().user.findMany({ where: { id: { in: list } }, select: { id: true, name: true, email: true, role: true } });
  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email, role: u.role }]));
}

/** El caso existe y está en el alcance del usuario (el asesor solo ve los suyos y los sin asignar); si no → 404. */
export async function assertCaseVisible(session: CurrentSession, opportunityId: string): Promise<void> {
  const found = await getPrisma().opportunity.findFirst({ where: { id: opportunityId, ...caseScope(session.user) }, select: { id: true } });
  if (!found) throw new ApiError('El caso no existe o no está dentro de tu alcance.', 404);
}

/** Fija campos del formulario desde la ruta (prevalecen sobre el cuerpo). */
export function withFields(form: FormData, fields: Record<string, string>): FormData {
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

/** Enlace firmado de 5 min a un documento YA autorizado (null → 404). */
export function documentLink(doc: { id: string; status: string; scanResult: string } | null, userId: string): DocumentLinkResponse {
  if (!doc) throw new ApiError('Documento no encontrado.', 404);
  if (doc.status === 'QUARANTINED' || doc.scanResult !== 'CLEAN') {
    throw new ApiError('El documento está en verificación antivirus. Inténtalo más tarde.', 423);
  }
  const now = Date.now();
  const url = temporaryDocumentUrl(doc.id, userId, now);
  return { ok: true, url, absoluteUrl: appUrl(url), expiresAt: new Date(now + LINK_TTL_MS).toISOString(), mimeType: 'application/pdf' };
}

export function docVersionView(
  d: { id: string; version: number; status: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: Date; expiresAt: Date | null; reviewedById: string | null; reviewedAt: Date | null; rejectReason: string | null; scanResult: string },
  names: Map<string, { name: string }>,
  today: string,
): DocumentVersionView {
  const expired = d.status === 'APPROVED' && d.expiresAt && d.expiresAt.toISOString().slice(0, 10) < today;
  return {
    id: d.id,
    version: d.version,
    status: labelOf(DOC_STATUS, expired ? 'EXPIRED' : d.status),
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt.toISOString(),
    expiresAt: day(d.expiresAt),
    reviewer: d.reviewedById ? names.get(d.reviewedById)?.name ?? 'Usuario' : null,
    reviewedAt: iso(d.reviewedAt),
    rejectReason: d.rejectReason,
    viewable: d.status !== 'QUARANTINED' && d.scanResult === 'CLEAN',
  };
}

type PropertyRow = {
  id: string; alias: string; kind: string; address: string | null; city: string | null; stratum: number | null; areaM2: { toString(): string } | null; isVis: boolean;
  valuations: Array<{ value: bigint; low: bigint | null; high: bigint | null; confidence: string; source: string; asOf: Date }>;
};

export function propertyView(p: PropertyRow): PropertyView {
  const v = p.valuations[0];
  return {
    id: p.id,
    alias: p.alias,
    kind: p.kind,
    address: p.address,
    city: p.city,
    stratum: p.stratum,
    areaM2: num(p.areaM2),
    isVis: p.isVis,
    valuation: v ? { value: toNumber(v.value), low: num(v.low), high: num(v.high), confidence: confidenceLabel(v.confidence), source: v.source, asOf: day(v.asOf) } : null,
  };
}

type LoanRow = {
  id: string; alias: string; active: boolean; balance: bigint; balanceAsOf: Date; rateEa: { toString(): string }; system: string; termMonths: number;
  paidInstallments: number; originalAmount: bigint; disbursedAt: Date; monthlyInsurance: bigint; confidence: string; source: string; entity: { name: string } | null;
};

export function loanView(l: LoanRow): LoanView {
  return {
    id: l.id,
    alias: l.alias,
    entityName: l.entity?.name ?? null,
    active: l.active,
    balance: toNumber(l.balance),
    balanceAsOf: day(l.balanceAsOf),
    rateEa: Number(l.rateEa.toString()),
    system: plainLabel(SYSTEM_LABELS, l.system),
    termMonths: l.termMonths,
    paidInstallments: l.paidInstallments,
    originalAmount: toNumber(l.originalAmount),
    disbursedAt: day(l.disbursedAt),
    monthlyInsurance: toNumber(l.monthlyInsurance),
    confidence: confidenceLabel(l.confidence),
    source: l.source,
  };
}

/** JSON seguro: BigInt → number y fechas → ISO (para before/after de la bitácora). */
export function plainJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

/**
 * Como `bodyAsForm`, pero un cuerpo vacío (acciones "sin cuerpo" como tomar o
 * aprobar) se acepta como formulario vacío en lugar de JSON inválido.
 */
export async function formOf(request: Request): Promise<FormData> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('multipart/form-data') && !type.includes('application/x-www-form-urlencoded')) {
    const text = await request.clone().text();
    if (!text.trim()) return new FormData();
  }
  return bodyAsForm(request);
}
