import { getPrisma } from '@/lib/prisma';
import { ALLY_ROLES, caseScope } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';

/** ¿Puede este usuario ver el expediente de esta persona? Se consulta en cada lectura sensible. */
export async function canAccessPerson(session: CurrentSession, personId: string): Promise<boolean> {
  const { user } = session;
  const prisma = getPrisma();
  if (user.role === 'CLIENT') {
    return Boolean(await prisma.person.findFirst({ where: { id: personId, userId: user.id }, select: { id: true } }));
  }
  if (ALLY_ROLES.includes(user.role)) {
    return Boolean(
      await prisma.opportunity.findFirst({ where: { personId, ...caseScope(user) }, select: { id: true } }),
    );
  }
  return true;
}

export async function canAccessCase(session: CurrentSession, opportunityId: string): Promise<boolean> {
  return Boolean(
    await getPrisma().opportunity.findFirst({ where: { id: opportunityId, ...caseScope(session.user) }, select: { id: true } }),
  );
}
