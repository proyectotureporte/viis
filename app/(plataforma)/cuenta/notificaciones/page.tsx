import type { Metadata } from 'next';
import Link from 'next/link';
import { Shell } from '@/components/ov/Shell';
import { SubmitButton } from '@/components/ov/forms';
import { Empty, PageHeader } from '@/components/ov/ui';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { portalFor } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { markNotificationsReadAction } from '../actions';

export const metadata: Metadata = { title: 'Notificaciones' };

export default async function NotificacionesPage() {
  const session = await requireUser();
  const items = await getPrisma().notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  const unread = items.some((n) => !n.readAt);
  return (
    <Shell portal={portalFor(session.user.role)} session={session}>
      <PageHeader
        title="Notificaciones"
        subtitle="Alertas y novedades de tus casos."
        actions={unread ? <form action={markNotificationsReadAction}><SubmitButton className="ov-btn ov-btn--secondary">Marcar todo como leído</SubmitButton></form> : undefined}
      />
      {items.length === 0 ? (
        <Empty>No tienes notificaciones.</Empty>
      ) : (
        <div className="ov-list">
          {items.map((n) => (
            <div className="ov-row" key={n.id}>
              <span className={n.readAt ? 'ov-dot ov-dot--gray' : 'ov-dot'} />
              <div className="grow">
                <strong>{n.title}</strong>
                <small>{n.body}</small>
                <small>{fechaHora(n.createdAt)}</small>
              </div>
              {n.href && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={n.href}>Ver</Link>}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
