import { apiSession, handler, json } from '@/lib/movil/http';
import { notificationView } from '@/lib/movil/util';
import type { NotificacionesResponse } from '@/lib/movil/contract';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bandeja del usuario (cualquier portal): las 100 más recientes. */
export const GET = handler(async () => {
  const session = await apiSession();
  const prisma = getPrisma();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);
  const body: NotificacionesResponse = { ok: true, unread, items: items.map(notificationView) };
  return json(body);
});
