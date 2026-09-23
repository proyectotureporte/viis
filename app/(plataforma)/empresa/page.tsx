import type { Metadata } from 'next';
import Link from 'next/link';
import { Prisma } from '@/app/generated/prisma/client';
import type { Stage } from '@/app/generated/prisma/enums';
import { ActionForm } from '@/components/ov/forms';
import { Empty, Kpi, Notice, PageHeader, Status } from '@/components/ov/ui';
import { OpButton } from '@/components/empresa/FormBits';
import { Funnel, Stack } from '@/components/empresa/ui';
import { bogotaMonthStart, fullName, monthLabel } from '@/lib/empresa/params';
import { fechaHora, money, pct, PIPELINE_STAGES, PRIORITY_LABELS, slaText, STAGE_LABELS, STAGE_SLA_HOURS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { can, caseScope } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { closeMyTaskAction } from './actions';

export const metadata: Metadata = { title: 'Operación' };

const CLOSED: Stage[] = ['WITHDRAWN', 'DISBURSED', 'POSTSALE'];
const CHANNEL_LABELS: Record<string, string> = { DIRECTO: 'Directo (asesores)', ALIADO: 'Aliados', WEB: 'Web' };
const DAY = 86_400_000;

export default async function OperacionPage() {
  const session = await requireUser({ portal: 'empresa' });
  const prisma = getPrisma();
  const scope = caseScope(session.user);
  const now = new Date();
  const monthStart = bogotaMonthStart(now);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since180 = new Date(now.getTime() - 180 * DAY);
  const soon = new Date(now.getTime() + 8 * 3_600_000);
  const isAdvisor = session.user.role === 'ADVISOR';
  // Alcance en SQL crudo: el asesor solo ve sus casos y los que no tienen responsable.
  const scopeSql = isAdvisor ? Prisma.sql`AND (o."assigneeId" = ${session.user.id}::uuid OR o."assigneeId" IS NULL)` : Prisma.empty;
  const open = { AND: [scope, { stage: { notIn: CLOSED } }] };

  const [overdue, dueSoon, pipeline, disbursed, filed180, filedDisbursed180, goals, tasks, byChannel, disbursedByChannel, urgentCases, stageDurations, funnelRows] = await Promise.all([
    prisma.opportunity.count({ where: { AND: [open, { slaDueAt: { lt: now } }] } }),
    prisma.opportunity.count({ where: { AND: [open, { slaDueAt: { gte: now, lt: soon } }] } }),
    prisma.opportunity.aggregate({ where: open, _sum: { amount: true }, _count: { _all: true } }),
    prisma.opportunity.aggregate({ where: { AND: [scope, { stages: { some: { to: 'DISBURSED', createdAt: { gte: monthStart } } } }] }, _sum: { disbursedAmount: true }, _count: { _all: true } }),
    prisma.opportunity.count({ where: { AND: [scope, { stages: { some: { to: 'FILED', createdAt: { gte: since180 } } } }] } }),
    prisma.opportunity.count({ where: { AND: [scope, { stages: { some: { to: 'FILED', createdAt: { gte: since180 } } } }, { stages: { some: { to: 'DISBURSED' } } }] } }),
    prisma.organization.aggregate({ where: { active: true, kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } }, _sum: { monthlyGoal: true } }),
    prisma.task.findMany({
      where: { assigneeId: session.user.id, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
      take: 8,
      include: { opportunity: { select: { id: true, code: true, person: { select: { firstName: true, lastName: true } } } } },
    }),
    prisma.opportunity.groupBy({ by: ['channel'], where: open, _count: { _all: true }, _sum: { amount: true } }),
    prisma.opportunity.groupBy({ by: ['channel'], where: { AND: [scope, { stages: { some: { to: 'DISBURSED', createdAt: { gte: monthStart } } } }] }, _count: { _all: true }, _sum: { disbursedAmount: true } }),
    prisma.opportunity.findMany({
      where: { AND: [open, { OR: [{ slaDueAt: { lt: soon } }, { priority: 'CRITICAL' }] }] },
      orderBy: [{ slaDueAt: { sort: 'asc', nulls: 'last' } }],
      take: 6,
      include: { person: { select: { firstName: true, lastName: true } }, assignee: { select: { name: true } } },
    }),
    // Duración de cada etapa cerrada en los últimos 30 días (desde StageChange consecutivos).
    prisma.$queryRaw<Array<{ stage: string; hours: number }>>`
      SELECT t."from"::text AS stage, (EXTRACT(EPOCH FROM (t."createdAt" - t.prev_at)) / 3600.0)::float8 AS hours
      FROM (
        SELECT sc."from", sc."createdAt", sc."opportunityId",
               LAG(sc."createdAt") OVER (PARTITION BY sc."opportunityId" ORDER BY sc."createdAt") AS prev_at
        FROM stage_changes sc
      ) t
      JOIN opportunities o ON o.id = t."opportunityId"
      WHERE t."createdAt" >= ${since30} AND t."from" IS NOT NULL AND t.prev_at IS NOT NULL ${scopeSql}`,
    // Embudo del mes: casos distintos que llegaron a cada etapa en el mes.
    prisma.$queryRaw<Array<{ stage: string; n: number }>>`
      SELECT sc."to"::text AS stage, COUNT(DISTINCT sc."opportunityId")::int AS n
      FROM stage_changes sc JOIN opportunities o ON o.id = sc."opportunityId"
      WHERE sc."createdAt" >= ${monthStart} ${scopeSql}
      GROUP BY sc."to"`,
  ]);

  const withSla = stageDurations.filter((d) => STAGE_SLA_HOURS[d.stage as Stage] !== undefined);
  const slaMet = withSla.filter((d) => d.hours <= (STAGE_SLA_HOURS[d.stage as Stage] ?? 0)).length;
  const slaRatio = withSla.length ? slaMet / withSla.length : null;
  const conversion = filed180 ? filedDisbursed180 / filed180 : null;
  const disbursedSum = toNumber(disbursed._sum.disbursedAmount);
  const goal = toNumber(goals._sum.monthlyGoal);
  const funnel = PIPELINE_STAGES.map((s) => ({ label: STAGE_LABELS[s], value: funnelRows.find((r) => r.stage === s)?.n ?? 0 }));
  const funnelHasData = funnel.some((f) => f.value > 0);
  const channelRows = ['DIRECTO', 'ALIADO', 'WEB'].map((c) => {
    const o = byChannel.find((b) => b.channel === c);
    const d = disbursedByChannel.find((b) => b.channel === c);
    return { channel: c, open: o?._count._all ?? 0, amount: toNumber(o?._sum.amount), disbursed: d?._count._all ?? 0, disbursedAmount: toNumber(d?._sum.disbursedAmount) };
  });
  const month = monthLabel(now);

  return (
    <>
      <PageHeader title="Centro de operación OpenV" subtitle={`Colocación, servicio y riesgo en una sola vista${isAdvisor ? ' · tus casos y los que no tienen responsable' : ''}.`} />

      {overdue > 0 || dueSoon > 0 ? (
        <Notice tone={overdue > 0 ? 'danger' : undefined}>
          {overdue > 0 && <><strong>{overdue} caso(s) con SLA vencido.</strong> </>}
          {dueSoon > 0 && <>{dueSoon} caso(s) vencen su SLA en las próximas 8 horas. </>}
          <Link href={overdue > 0 ? '/empresa/bandeja?vencidos=1' : '/empresa/bandeja'}>Ir a la bandeja</Link>
        </Notice>
      ) : (
        <Notice tone="info">No hay casos vencidos ni próximos a vencer su SLA.</Notice>
      )}

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <Kpi label="Pipeline total" value={money(pipeline._sum.amount, true)} sub={`${pipeline._count._all} oportunidades activas`} />
        <Kpi
          label={`Desembolsos · ${month}`}
          value={money(disbursedSum, true)}
          sub={goal > 0 ? `${disbursed._count._all} casos · ${pct(disbursedSum / goal)} de la meta de aliados (${money(goal, true)})` : `${disbursed._count._all} casos desembolsados`}
        />
        <Kpi label="Conversión" value={conversion === null ? '—' : pct(conversion)} sub={conversion === null ? 'Sin radicaciones en 180 días' : `Radicado → desembolso · ${filedDisbursed180} de ${filed180} (180 días)`} />
        <Kpi
          label="SLA cumplido"
          value={slaRatio === null ? '—' : pct(slaRatio)}
          sub={slaRatio === null ? 'Sin etapas cerradas en 30 días' : `${slaMet} de ${withSla.length} etapas cerradas en 30 días · objetivo ≥ 95%`}
          tone={slaRatio === null ? undefined : slaRatio >= 0.95 ? 'positive' : 'negative'}
        />
      </div>

      <div className="ov-grid">
        <article className="ov-card s7">
          <header>
            <h2>Casos que requieren atención</h2>
            {can(session.user.role, 'case.read') && <Link href="/empresa/bandeja">Bandeja completa →</Link>}
          </header>
          {urgentCases.length === 0 ? (
            <Empty>Nada urgente: ningún caso crítico ni con SLA en las próximas 8 horas.</Empty>
          ) : (
            <div className="ov-list">
              {urgentCases.map((o) => {
                const sla = slaText(o.slaDueAt, now.getTime());
                return (
                  <div className="ov-row" key={o.id}>
                    <span className={`ov-dot ${sla.tone === 'bad' ? 'ov-dot--red' : sla.tone === 'wait' ? 'ov-dot--amber' : ''}`} />
                    <div className="grow">
                      <Link href={`/empresa/casos/${o.id}`}><strong>{o.code} · {fullName(o.person)}</strong></Link>
                      <small>{STAGE_LABELS[o.stage]} · {o.assignee?.name ?? 'Sin responsable'} · {PRIORITY_LABELS[o.priority].label}</small>
                    </div>
                    <Status tone={sla.tone}>{sla.text}</Status>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="ov-card s5">
          <h2>Mis tareas</h2>
          {tasks.length === 0 ? (
            <Empty>No tienes tareas abiertas.</Empty>
          ) : (
            <div className="ov-list">
              {tasks.map((t) => {
                const late = t.dueAt < now;
                return (
                  <div className="ov-row" key={t.id}>
                    <span className={late ? 'ov-dot ov-dot--red' : 'ov-dot'} />
                    <div className="grow">
                      <strong>{t.title}</strong>
                      <small>
                        {late ? 'Vencida · ' : ''}{fechaHora(t.dueAt)}
                        {t.opportunity && <> · <Link href={`/empresa/casos/${t.opportunity.id}`}>{t.opportunity.code} {fullName(t.opportunity.person)}</Link></>}
                      </small>
                    </div>
                    <ActionForm action={closeMyTaskAction} className="ove-inline-form">
                      <input type="hidden" name="id" value={t.id} />
                      <OpButton name="status" value="DONE" className="ov-btn ov-btn--small">Hecha</OpButton>
                    </ActionForm>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </div>

      <div className="ov-grid">
        <article className="ov-card s6">
          <header><h2>Embudo de colocación</h2><span className="ov-pill">{month}</span></header>
          {funnelHasData ? <Funnel rows={funnel} /> : <Empty>Aún no hay movimientos de etapa este mes.</Empty>}
          <p className="ov-meta" style={{ marginTop: 10 }}>Casos distintos que llegaron a cada etapa durante el mes.</p>
        </article>
        <article className="ov-card s6">
          <h2>Operación por canal</h2>
          <Stack rows={channelRows.map((c) => ({ label: CHANNEL_LABELS[c.channel], value: c.open }))} />
          <div className="ov-list" style={{ marginTop: 14 }}>
            {channelRows.map((c) => (
              <div className="ov-row" key={c.channel}>
                <div className="grow">
                  <strong>{CHANNEL_LABELS[c.channel]}</strong>
                  <small>{c.open} casos activos · {money(c.amount, true)} en pipeline</small>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>{c.disbursed} desembolsos</strong>
                  <small className="ov-meta">{money(c.disbursedAmount, true)} este mes</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </>
  );
}
