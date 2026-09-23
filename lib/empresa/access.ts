import type { Prisma } from '@/app/generated/prisma/client';
import type { Role } from '@/app/generated/prisma/enums';
import { UserError } from '@/lib/actions';
import { getPrisma } from '@/lib/prisma';
import { caseScope, STAFF_ROLES } from '@/lib/security/rbac';
import type { CurrentSession, SessionUser } from '@/lib/security/session';

type Tx = Prisma.TransactionClient;

/** Contexto que las funciones de dominio esperan: actor + metadatos de la petición. */
export interface ActionCtx {
  actor: SessionUser;
  meta: { ipHash?: string; userAgent?: string };
}

/**
 * Verifica que el caso exista y esté dentro del alcance del usuario (el asesor
 * solo ve casos asignados a él o sin asignar). Se llama en CADA acción sobre un caso.
 */
export async function assertCaseInScope(session: CurrentSession | { user: SessionUser }, opportunityId: string, tx?: Tx): Promise<void> {
  const db = tx ?? getPrisma();
  const found = await db.opportunity.findFirst({ where: { id: opportunityId, ...caseScope(session.user) }, select: { id: true } });
  if (!found) throw new UserError('El caso no existe o no está dentro de tu alcance.');
}

/** Personal interno activo (para asignar casos, tareas y solicitudes). */
export async function activeStaff(roles: Role[] = STAFF_ROLES) {
  return getPrisma().user.findMany({
    where: { role: { in: roles }, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
}

export async function assertActiveStaff(userId: string, tx?: Tx): Promise<{ id: string; name: string; email: string; role: Role }> {
  const user = await (tx ?? getPrisma()).user.findFirst({
    where: { id: userId, active: true, role: { in: STAFF_ROLES } },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new UserError('El responsable elegido no es un usuario interno activo.');
  return user;
}
