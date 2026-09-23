import type { Metadata } from 'next';
import Link from 'next/link';
import { TaskForm } from '@/components/aliado/TaskForm';
import { TaskItem, type TaskView } from '@/components/aliado/TaskItem';
import { Empty, PageHeader } from '@/components/ov/ui';
import { ACTIVE_STAGES, allyCases, personName } from '@/lib/aliado/scope';
import { addDaysYmd, bogotaDayStart, bogotaYmd, dayTitle } from '@/lib/aliado/time';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Agenda' };

export default async function AgendaPage() {
  const session = await requireUser({ portal: 'aliado', permission: 'case.note' });
  const { user } = session;
  const prisma = getPrisma();
  const now = new Date();
  const today = bogotaYmd(now);
  const todayStart = bogotaDayStart(today);
  const weekEnd = bogotaDayStart(addDaysYmd(today, 8));

  const [overdue, upcoming, later, done, cases] = await Promise.all([
    prisma.task.findMany({ where: { assigneeId: user.id, status: 'OPEN', dueAt: { lt: todayStart } }, orderBy: { dueAt: 'asc' }, take: 100, include: { opportunity: { select: { id: true, code: true } } } }),
    prisma.task.findMany({ where: { assigneeId: user.id, status: 'OPEN', dueAt: { gte: todayStart, lt: weekEnd } }, orderBy: { dueAt: 'asc' }, take: 300, include: { opportunity: { select: { id: true, code: true } } } }),
    prisma.task.count({ where: { assigneeId: user.id, status: 'OPEN', dueAt: { gte: weekEnd } } }),
    prisma.task.findMany({ where: { assigneeId: user.id, status: { in: ['DONE', 'CANCELLED'] } }, orderBy: [{ doneAt: 'desc' }, { dueAt: 'desc' }], take: 10, include: { opportunity: { select: { id: true, code: true } } } }),
    prisma.opportunity.findMany({
      where: { AND: [allyCases(user), { stage: { in: ACTIVE_STAGES } }] },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, code: true, person: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const days = Array.from({ length: 8 }, (_, i) => addDaysYmd(today, i));
  const byDay = new Map<string, TaskView[]>(days.map((d) => [d, []]));
  for (const task of upcoming) byDay.get(bogotaYmd(task.dueAt))?.push(task);

  return (
    <>
      <PageHeader title="Agenda" subtitle="Citas, llamadas y tareas en hora de Colombia. Exporta tus citas a tu calendario." />
      <div className="ov-grid">
        <div className="s8" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          {overdue.length > 0 && (
            <article className="ov-card">
              <header><h2>Vencidas</h2><span className="ov-status ov-status--bad">{overdue.length}</span></header>
              <div className="ov-list">{overdue.map((t) => <TaskItem key={t.id} task={t} />)}</div>
            </article>
          )}
          <article className="ov-card">
            <h2>Hoy y próximos 7 días</h2>
            {upcoming.length === 0 ? (
              <Empty>No tienes actividades para esta semana. Agenda la próxima llamada con tus clientes en proceso.</Empty>
            ) : (
              days.map((day) => {
                const items = byDay.get(day) ?? [];
                if (!items.length && day !== today) return null;
                return (
                  <section key={day} className="al-day" aria-label={dayTitle(day)}>
                    <h3>{day === today ? `Hoy · ${dayTitle(day)}` : day === addDaysYmd(today, 1) ? `Mañana · ${dayTitle(day)}` : dayTitle(day)}</h3>
                    {items.length === 0 ? <p className="ov-meta">Nada pendiente para hoy.</p> : <div className="ov-list">{items.map((t) => <TaskItem key={t.id} task={t} showTime />)}</div>}
                  </section>
                );
              })
            )}
            {later > 0 && <p className="ov-meta" style={{ marginTop: 12 }}>Tienes {later === 1 ? '1 actividad programada' : `${later} actividades programadas`} después de esta semana.</p>}
          </article>
          {done.length > 0 && (
            <details className="ov-card ov-details">
              <summary>Cerradas recientemente</summary>
              <div className="ov-list">{done.map((t) => <TaskItem key={t.id} task={t} editable={false} />)}</div>
            </details>
          )}
        </div>
        <article className="ov-card s4" style={{ alignSelf: 'start' }}>
          <h2>Nueva actividad</h2>
          <TaskForm today={today} cases={cases.map((c) => ({ id: c.id, label: `${c.code} · ${personName(c.person)}` }))} />
          <p className="ov-meta" style={{ marginTop: 12 }}>
            Las citas tienen el botón <strong>Calendario</strong> para descargarlas en formato .ics (Google Calendar, Outlook o el calendario del teléfono). ¿Buscas un cliente? <Link href="/aliado/clientes">Ve a Clientes</Link>.
          </p>
        </article>
      </div>
    </>
  );
}
