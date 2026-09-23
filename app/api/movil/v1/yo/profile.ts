import { getPrisma } from '@/lib/prisma';
import { portalFor, ROLE_LABELS, ROLE_PERMISSIONS } from '@/lib/security/rbac';

/** Perfil que la app necesita para decidir qué portal mostrar. */
export async function profile(userId: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { organization: true, person: { select: { id: true, firstName: true } } } });
  const unread = await prisma.notification.count({ where: { userId, readAt: null } });
  return {
    id: user.id,
    name: user.name,
    firstName: user.person?.firstName ?? user.name.split(' ')[0],
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    portal: portalFor(user.role),
    permissions: ROLE_PERMISSIONS[user.role],
    organization: user.organization ? { id: user.organization.id, name: user.organization.name } : null,
    unreadNotifications: unread,
  };
}
