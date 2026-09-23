import type { Metadata } from 'next';
import Link from 'next/link';
import { TaskItem } from '@/components/aliado/TaskItem';
import { Empty, Kpi, Notice, PageHeader, Status } from '@/components/ov/ui';
import { ACTIVE_STAGES, allyCases, certState, critical, CLOSED_OK, commissionScope, isAllyAdmin, latestCertByCourse, missingByCase, personName } from '@/lib/aliado/scope';
import { addDaysYmd, bogotaDayStart, bogotaMonthStart, bogotaYmd } from '@/lib/aliado/time';
import { TIER_LABELS } from '@/lib/aliado/labels';
import { allyBlockingCertifications } from '@/lib/domain/cases';
import { fechaDia, fechaHora, money, pct, PRODUCTS, slaText, STAGE_LABELS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Resumen' };


export default async function AliadoResumenPage() {
  const session = await requireUser({ portal: 'aliado' });
  const { user } = session;
  const admin = isAllyAdmin(user);
  const scope = allyCases(user);
  const prisma = getPrisma();
  const now = new Date();
  const monthStart = bogotaMonthStart(now);
  const tomorrow = bogotaDayStart(addDaysYmd(bogotaYmd(now), 1));
  const soon = new Date(now.getTime() + 24 * 3_600_000);

  const [org, pipeline, disbursedChanges, commissionGroups, stageGroups, urgentSla, docCases, tasks, notices, blocking, courses, certs, nextPayment] = await Promise.all([
    user.organizationId ? prisma.organization.findUnique({ where: { id: user.organizationId } }) : Promise.resolve(null),
    prisma.opportunity.aggregate({ where: { AND: [scope, { stage: { in: ACTIVE_STAGES } }] }, _sum: { amount: true }, _count: true }),
    prisma.stageChange.findMany({
      where: { to: 'DISBURSED', createdAt: { gte: monthStart }, opportunity: scope },
      select: { opportunity: { select: { id: true, disbursedAmount: true } } },
    }),
    prisma.commission.groupBy({ by: ['status'], where: commissionScope(user), _sum: { net: true }, _count: true }),
    prisma.opportunity.groupBy({ by: ['stage'], where: scope, _count: true }),
    prisma.opportunity.findMany({
      where: { AND: [scope, { stage: { in: ACTIVE_STAGES } }, { slaDueAt: { lte: soon } }] },
      orderBy: { slaDueAt: 'asc' },
      take: 8,
      include: { person: { select: { firstName: true, lastName: true } } },
    }),
    prisma.opportunity.findMany({
      where: { AND: [scope, { stage: { in: ['CONTACTED', 'PROFILED', 'DOCUMENTING'] } }] },
      orderBy: { stageAt: 'asc' },
      take: 30,
      select: { id: true, code: true, personId: true, product: true, stage: true, stageAt: true, person: { select: { firstName: true, lastName: true } } },
    }),
    prisma.task.findMany({
      where: { assigneeId: user.id, status: 'OPEN', dueAt: { lt: tomorrow } },
      orderBy: { dueAt: 'asc' },
      take: 12,
      include: { opportunity: { select: { id: true, code: true } } },
    }),
    prisma.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: 'desc' }, take: 5 }),
    allyBlockingCertifications(prisma, user.id),
    prisma.course.findMany({ where: { active: true, OR: [{ mandatory: true }, { critical: true }] }, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, title: true, critical: true } }),
    prisma.certification.findMany({ where: { userId: user.id }, select: { courseId: true, expiresAt: true } }),
    prisma.commission.findFirst({ where: { ...commissionScope(user), status: { in: ['APPROVED', 'SCHEDULED', 'CAUSED'] } }, orderBy: { expectedPayAt: 'asc' }, select: { expectedPayAt: true } }),
  ]);

  const seen = new Set<string>();
  let disbursedMonth = 0;
  for (const change of disbursedChanges) {
    if (seen.has(change.opportunity.id)) continue;
    seen.add(change.opportunity.id);
    disbursedMonth += toNumber(change.opportunity.disbursedAmount);
  }
  const goal = toNumber(org?.monthlyGoal);
  const goalPct = goal > 0 ? disbursedMonth / goal : null;

  const sumBy = (...statuses: string[]) => commissionGroups.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + toNumber(g._sum.net), 0);

  const totalCases = stageGroups.reduce((s, g) => s + g._count, 0);
  const won = stageGroups.filter((g) => CLOSED_OK.includes(g.stage)).reduce((s, g) => s + g._count, 0);
  const lost = stageGroups.find((g) => g.stage === 'WITHDRAWN')?._count ?? 0;

  const missing = await missingByCase(prisma, docCases);
  const docUrgent = docCases.filter((c) => (missing.get(c.id) ?? []).length > 0).slice(0, 8);
  const certByCourse = latestCertByCourse(certs);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name.split(' ')[0]}`}
        subtitle={admin ? `Resumen de ${org?.name ?? 'tu organización'}: prioriza clientes, controla tus negocios y conoce cada comisión.` : 'Prioriza clientes, controla tus negocios y conoce cada comisión.'}
        actions={<Link className="ov-btn" href="/aliado/clientes/nuevo">+ Nuevo cliente</Link>}
      />

      {blocking.length > 0 && (
        <Notice tone="danger">
          <strong>Tus radicaciones están bloqueadas.</strong> Tienes certificaciones críticas vencidas o pendientes: {blocking.join(', ')}. Mientras no las renueves, OpenV no puede radicar tus casos ante las entidades. <Link href="/aliado/academia">Ir a la Academia</Link>
        </Notice>
      )}

      <div className="ov-grid" style={{ marginTop: blocking.length ? 16 : 0 }}>
        <Kpi label="Cartera en trámite" value={money(toNumber(pipeline._sum.amount), true)} sub={pipeline._count === 1 ? '1 oportunidad activa' : `${pipeline._count} oportunidades activas`} />
        <Kpi
          label="Desembolsado este mes"
          value={money(disbursedMonth, true)}
          sub={goalPct !== null ? `${pct(goalPct, 0)} de la meta de ${money(goal, true)}` : 'Sin meta mensual definida'}
          tone={goalPct !== null && goalPct >= 1 ? 'positive' : undefined}
        >
          {goalPct !== null && <div className="al-kpi-bar" aria-hidden><i style={{ width: `${Math.min(100, goalPct * 100)}%` }} /></div>}
        </Kpi>
        <Kpi
          label="Comisión causada"
          value={money(sumBy('CAUSED'), true)}
          sub={
            <>
              Aprobada {money(sumBy('APPROVED', 'SCHEDULED'), true)} · pagada {money(sumBy('PAID'), true)}
              {nextPayment && <><br />Próximo pago previsto: {fechaDia(nextPayment.expectedPayAt)}</>}
            </>
          }
        />
        <Kpi
          label="Conversión"
          value={totalCases ? pct(won / totalCases, 0) : '—'}
          sub={totalCases ? `${won} de ${totalCases} casos desembolsados · ${lost} desistidos` : 'Aún no hay casos'}
        />
      </div>

      <div className="ov-section">
        <h2>Clientes que requieren acción</h2>
        <Link href="/aliado/embudo" className="ov-btn ov-btn--secondary ov-btn--small">Ver embudo</Link>
      </div>
      {urgentSla.length === 0 && docUrgent.length === 0 ? (
        <Empty>No hay casos con SLA próximo ni documentos pendientes. {totalCases === 0 && <Link href="/aliado/clientes/nuevo">Registra tu primer cliente</Link>}</Empty>
      ) : (
        <article className="ov-card ov-tablewrap">
          <table className="ov-table">
            <thead>
              <tr><th>Cliente</th><th>Etapa</th><th>Pendiente</th><th>Urgencia</th></tr>
            </thead>
            <tbody>
              {urgentSla.map((c) => {
                const sla = slaText(c.slaDueAt);
                return (
                  <tr key={`sla-${c.id}`}>
                    <td><Link href={`/aliado/clientes/${c.id}`}><strong>{personName(c.person)}</strong></Link><small>{c.code} · {PRODUCTS[c.product] ?? c.product}</small></td>
                    <td><Status tone="wait">{STAGE_LABELS[c.stage]}</Status></td>
                    <td>{c.nextAction ?? '—'}</td>
                    <td className={sla.tone === 'bad' ? 'ov-negative' : ''}>{sla.tone === 'bad' ? sla.text : `SLA en ${sla.text}`}</td>
                  </tr>
                );
              })}
              {docUrgent
                .filter((c) => !urgentSla.some((u) => u.id === c.id))
                .map((c) => {
                  const faltan = missing.get(c.id) ?? [];
                  return (
                    <tr key={`doc-${c.id}`}>
                      <td><Link href={`/aliado/clientes/${c.id}`}><strong>{personName(c.person)}</strong></Link><small>{c.code} · {PRODUCTS[c.product] ?? c.product}</small></td>
                      <td><Status tone="wait">{STAGE_LABELS[c.stage]}</Status></td>
                      <td>{faltan.length === 1 ? faltan[0] : `${faltan.length} documentos: ${faltan.slice(0, 2).join(', ')}${faltan.length > 2 ? '…' : ''}`}</td>
                      <td>Faltantes documentales</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </article>
      )}

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s6">
          <header>
            <h2>Para hoy</h2>
            <Link href="/aliado/agenda" className="ov-btn ov-btn--secondary ov-btn--small">Agenda</Link>
          </header>
          {tasks.length === 0 ? (
            <p className="ov-meta">No tienes tareas pendientes para hoy. <Link href="/aliado/agenda">Agenda una llamada o cita</Link>.</p>
          ) : (
            <div className="ov-list">{tasks.map((t) => <TaskItem key={t.id} task={t} />)}</div>
          )}
        </article>

        <article className="ov-card s6">
          <header>
            <h2>Nivel y certificación</h2>
            {org && <span className="ov-pill">Nivel {TIER_LABELS[org.tier] ?? org.tier}</span>}
          </header>
          {courses.length === 0 ? (
            <p className="ov-meta">No hay cursos obligatorios publicados.</p>
          ) : (
            <div className="ov-list">
              {courses.map((course) => {
                const state = critical(certState(certByCourse.get(course.id)?.expiresAt), course.critical);
                return (
                  <Link key={course.id} className="ov-row al-row-link" href={`/aliado/academia/${course.slug}`}>
                    <span className={state.tone === 'ok' ? 'ov-dot' : state.tone === 'wait' ? 'ov-dot ov-dot--amber' : 'ov-dot ov-dot--red'} />
                    <div className="grow">
                      <strong>{course.title}{course.critical && <span className="al-tag al-tag--critical">Crítico</span>}</strong>
                    </div>
                    <span className={`ov-status${state.tone === 'ok' ? '' : ` ov-status--${state.tone}`}`}>{state.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </article>
      </div>

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s12">
          <header>
            <h2>Avisos</h2>
            <Link href="/cuenta/notificaciones" className="ov-btn ov-btn--secondary ov-btn--small">Todas</Link>
          </header>
          {notices.length === 0 ? (
            <p className="ov-meta">Estás al día: no hay avisos sin leer.</p>
          ) : (
            <div className="ov-list">
              {notices.map((n) => (
                <div className="ov-row" key={n.id}>
                  <span className="ov-dot" />
                  <div className="grow"><strong>{n.title}</strong><small>{n.body} · {fechaHora(n.createdAt)}</small></div>
                  {n.href && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={n.href}>Ver</Link>}
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </>
  );
}
