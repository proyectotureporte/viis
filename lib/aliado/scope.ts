import type { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import type { Stage } from '@/app/generated/prisma/enums';
import type { ActionState } from '@/components/ov/forms';
import { ok, secureAction, UserError } from '@/lib/actions';
import { getPrisma } from '@/lib/prisma';
import { ALLY_ROLES, caseScope, type Permission } from '@/lib/security/rbac';
import type { RequestMeta } from '@/lib/security/request';
import type { CurrentSession, SessionUser } from '@/lib/security/session';

type Db = Prisma.TransactionClient;

/** Etapas en trámite: cuentan como cartera viva del aliado. */
export const ACTIVE_STAGES: Stage[] = ['LEAD', 'CONTACTED', 'PROFILED', 'DOCUMENTING', 'FILED', 'APPROVED', 'SIGNED'];
export const CLOSED_OK: Stage[] = ['DISBURSED', 'POSTSALE'];

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export function isAllyAdmin(user: Pick<SessionUser, 'role'>): boolean {
  return user.role === 'ALLY_ADMIN';
}

/** Alcance de comisiones: el aliado ve las suyas; el administrador, las de su organización. */
export function commissionScope(user: Pick<SessionUser, 'id' | 'role' | 'organizationId'>): Prisma.CommissionWhereInput {
  return isAllyAdmin(user) ? { allyOrgId: user.organizationId ?? NIL_UUID } : { allyUserId: user.id };
}

/** Alcance de casos tipado para Prisma (envuelve `caseScope`, la única fuente de verdad). */
export function allyCases(user: Pick<SessionUser, 'id' | 'role' | 'organizationId'>): Prisma.OpportunityWhereInput {
  return caseScope(user) as Prisma.OpportunityWhereInput;
}

/**
 * Acción de servidor exclusiva del portal aliado: además del permiso exige que
 * el rol sea de aliado y que pertenezca a una organización. Evita que un rol
 * interno con el mismo permiso (p. ej. coordinación con 'case.assign') use
 * las acciones del portal con un alcance que no le corresponde.
 */
export function allyAction<S extends z.ZodType>(
  permission: Permission,
  schema: S,
  handler: (input: z.infer<S>, ctx: { session: CurrentSession; meta: RequestMeta; orgId: string }) => Promise<ActionState>,
) {
  return secureAction(permission, schema, async (input, ctx) => {
    if (!ALLY_ROLES.includes(ctx.session.user.role)) throw new UserError('Esta acción es solo para aliados.');
    const orgId = ctx.session.user.organizationId;
    if (!orgId) throw new UserError('Tu usuario no está vinculado a una organización aliada. Escribe a contacto@viis.app.');
    return handler(input, { ...ctx, orgId });
  });
}

/** Resultado exitoso con enlace de continuación (lo interpreta `AllyForm`). */
export function okWithLink(message: string, href: string, linkLabel?: string): ActionState {
  return { ...ok(message)!, href, linkLabel } as NonNullable<ActionState>;
}

/** Caso dentro del alcance del usuario o error amable (nunca revela si existe fuera de él). */
export async function scopedCase(db: Db, user: SessionUser, id: string) {
  const opportunity = await db.opportunity.findFirst({ where: { id, ...allyCases(user) }, include: { person: true } });
  if (!opportunity) throw new UserError('No encontramos ese caso en tu cartera.');
  return opportunity;
}

/**
 * Faltantes documentales de varios casos en dos consultas (misma regla que
 * `missingDocuments`: tipos requeridos del producto sin versión aprobada vigente).
 */
export async function missingByCase(
  db: Db = getPrisma(),
  cases: Array<{ id: string; personId: string; product: string }>,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!cases.length) return result;
  const types = await db.documentType.findMany({ where: { active: true, required: true }, orderBy: { sortOrder: 'asc' } });
  const approved = await db.document.findMany({
    where: {
      personId: { in: [...new Set(cases.map((c) => c.personId))] },
      status: 'APPROVED',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { personId: true, typeId: true },
  });
  const ok = new Set(approved.map((d) => `${d.personId}:${d.typeId}`));
  for (const c of cases) {
    const needed = types.filter((t) => t.products.length === 0 || t.products.includes(c.product));
    result.set(c.id, needed.filter((t) => !ok.has(`${c.personId}:${t.id}`)).map((t) => t.name));
  }
  return result;
}

export function personName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function maskedDocument(person: { documentType: string; documentLast4: string }): string {
  return `${person.documentType} ···${person.documentLast4}`;
}

// ── Certificaciones ─────────────────────────────────────────────────────

export type CertState = { label: string; tone: 'ok' | 'wait' | 'bad' | 'gray'; valid: boolean; days: number | null };

export function certState(expiresAt: Date | null | undefined, now = Date.now()): CertState {
  if (!expiresAt) return { label: 'Sin certificar', tone: 'gray', valid: false, days: null };
  const days = Math.ceil((expiresAt.getTime() - now) / 86_400_000);
  if (days <= 0) return { label: `Vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`, tone: 'bad', valid: false, days };
  if (days <= 30) return { label: `Vence en ${days} ${days === 1 ? 'día' : 'días'}`, tone: 'wait', valid: true, days };
  return { label: 'Vigente', tone: 'ok', valid: true, days };
}

/** Un curso crítico sin certificación vigente se muestra como bloqueo (rojo), no como pendiente neutro. */
export function critical(state: CertState, isCritical: boolean): CertState {
  return isCritical && !state.valid ? { ...state, tone: 'bad', label: state.days === null ? 'Pendiente · bloquea radicar' : state.label } : state;
}

/** Última certificación por curso (la de mayor vencimiento). */
export function latestCertByCourse<T extends { courseId: string; expiresAt: Date }>(certs: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const cert of certs) {
    const current = map.get(cert.courseId);
    if (!current || cert.expiresAt > current.expiresAt) map.set(cert.courseId, cert);
  }
  return map;
}
