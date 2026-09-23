import type { Metadata } from 'next';
import Link from 'next/link';
import type { Stage } from '@/app/generated/prisma/enums';
import { Empty, PageHeader } from '@/components/ov/ui';
import { allyCases, isAllyAdmin, personName } from '@/lib/aliado/scope';
import { daysBetween } from '@/lib/aliado/time';
import { money, pct, PIPELINE_STAGES, PRODUCTS, slaText, STAGE_LABELS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Embudo' };

const PER_COLUMN = 25;
const HOURS = 3_600_000;

function duration(ms: number): string {
  const hours = ms / HOURS;
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1).replace('.', ',') : Math.round(days)} d`;
}

export default async function EmbudoPage() {
  const session = await requireUser({ portal: 'aliado', permission: 'case.read' });
  const admin = isAllyAdmin(session.user);
  const prisma = getPrisma();
  const cases = await prisma.opportunity.findMany({
    where: allyCases(session.user),
    orderBy: { stageAt: 'asc' },
    take: 3000,
    select: {
      id: true,
      code: true,
      stage: true,
      stageAt: true,
      slaDueAt: true,
      product: true,
      amount: true,
      disbursedAmount: true,
      withdrawReason: true,
      person: { select: { firstName: true, lastName: true } },
      allyUser: { select: { name: true } },
      stages: { orderBy: { createdAt: 'asc' }, select: { to: true, createdAt: true } },
    },
  });

  // Métricas: cuántos casos alcanzaron cada etapa y cuánto tiempo pasan en ella.
  const reached = new Map<Stage, number>(PIPELINE_STAGES.map((s) => [s, 0]));
  const stints = new Map<Stage, number[]>(PIPELINE_STAGES.map((s) => [s, []]));
  const withdrawReasons = new Map<string, number>();
  for (const c of cases) {
    const maxIndex = Math.max(
      ...c.stages.map((s) => PIPELINE_STAGES.indexOf(s.to)),
      PIPELINE_STAGES.indexOf(c.stage === 'POSTSALE' ? 'DISBURSED' : c.stage),
    );
    PIPELINE_STAGES.forEach((stage, i) => {
      if (i <= maxIndex) reached.set(stage, (reached.get(stage) ?? 0) + 1);
    });
    c.stages.forEach((change, i) => {
      const next = c.stages[i + 1];
      if (next && PIPELINE_STAGES.includes(change.to)) stints.get(change.to)!.push(next.createdAt.getTime() - change.createdAt.getTime());
    });
    if (c.stage === 'WITHDRAWN' && c.withdrawReason) withdrawReasons.set(c.withdrawReason, (withdrawReasons.get(c.withdrawReason) ?? 0) + 1);
  }
  const leads = reached.get('LEAD') ?? 0;

  const byStage = (stage: Stage) => cases.filter((c) => c.stage === stage || (stage === 'DISBURSED' && c.stage === 'POSTSALE'));
  const withdrawn = cases.filter((c) => c.stage === 'WITHDRAWN');

  return (
    <>
      <PageHeader title="Embudo" subtitle={admin ? 'Todos los casos de tu organización por etapa.' : 'Tus casos por etapa, con monto, tiempo en la etapa y SLA.'} actions={<Link className="ov-btn" href="/aliado/clientes/nuevo">+ Nuevo cliente</Link>} />

      {cases.length === 0 ? (
        <Empty>Tu embudo está vacío. <Link href="/aliado/clientes/nuevo">Registra un cliente</Link> y verás aquí su avance desde Lead hasta Desembolsado.</Empty>
      ) : (
        <>
          <div className="ov-kanban al-kanban" role="list" aria-label="Casos por etapa">
            {PIPELINE_STAGES.map((stage) => {
              const column = byStage(stage);
              const total = column.reduce((s, c) => s + toNumber(stage === 'DISBURSED' ? c.disbursedAmount ?? c.amount : c.amount), 0);
              const visible = stage === 'DISBURSED' ? [...column].reverse().slice(0, PER_COLUMN) : column.slice(0, PER_COLUMN);
              return (
                <section key={stage} role="listitem" aria-label={`${STAGE_LABELS[stage]}: ${column.length} casos`}>
                  <h3><span>{STAGE_LABELS[stage]}</span><span>{column.length}</span></h3>
                  {total > 0 && <p className="ov-meta" style={{ margin: '-6px 4px 8px' }}>{money(total, true)}</p>}
                  {visible.map((c) => {
                    const closed = stage === 'DISBURSED';
                    const sla = closed ? null : slaText(c.slaDueAt);
                    const days = daysBetween(c.stageAt);
                    return (
                      <article key={c.id}>
                        <Link href={`/aliado/clientes/${c.id}`}>{personName(c.person)}</Link>
                        <small>{c.code} · {PRODUCTS[c.product] ?? c.product}</small>
                        {admin && c.allyUser && <small>{c.allyUser.name}</small>}
                        <div className="al-card-foot">
                          <span className="ov-money">{c.disbursedAmount ? money(c.disbursedAmount, true) : c.amount ? money(c.amount, true) : 'Sin monto'}</span>
                          <span className="ov-meta">{days === 0 ? 'hoy' : `${days} d`}</span>
                        </div>
                        {sla && <small className={sla.tone === 'bad' ? 'ov-negative' : ''}>{sla.tone === 'bad' ? sla.text : `SLA ${sla.text}`}</small>}
                      </article>
                    );
                  })}
                  {column.length > PER_COLUMN && <p className="al-more">y {column.length - PER_COLUMN} más · <Link href={`/aliado/clientes?etapa=${stage}`}>ver todos</Link></p>}
                  {column.length === 0 && <p className="al-more">Sin casos</p>}
                </section>
              );
            })}
          </div>

          {withdrawn.length > 0 && (
            <details className="ov-card ov-details" style={{ marginTop: 16 }}>
              <summary>Desistidos ({withdrawn.length})</summary>
              <div className="ov-list">
                {withdrawn.slice(-50).reverse().map((c) => (
                  <Link key={c.id} href={`/aliado/clientes/${c.id}`} className="ov-row al-row-link">
                    <span className="ov-dot ov-dot--gray" />
                    <div className="grow"><strong>{personName(c.person)}</strong><small>{c.code} · {PRODUCTS[c.product] ?? c.product} · {c.withdrawReason ?? 'Sin causa registrada'}</small></div>
                  </Link>
                ))}
              </div>
            </details>
          )}

          <div className="ov-grid" style={{ marginTop: 16 }}>
            <article className="ov-card s8">
              <h2>Conversión por etapa</h2>
              <p className="ov-meta" style={{ marginTop: -6 }}>Casos que alguna vez llegaron a cada etapa, frente a los leads registrados. El tiempo promedio mide cuánto tardan en salir de la etapa.</p>
              <div className="al-stage-metrics">
                {PIPELINE_STAGES.map((stage, i) => {
                  const n = reached.get(stage) ?? 0;
                  const prev = i > 0 ? reached.get(PIPELINE_STAGES[i - 1]) ?? 0 : n;
                  const times = stints.get(stage) ?? [];
                  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
                  return (
                    <div key={stage}>
                      <span>{STAGE_LABELS[stage]}</span>
                      <b style={{ width: `${leads ? Math.max(2, (n / leads) * 100) : 0}%` }} aria-hidden />
                      <span className="ov-meta">{n} · {i === 0 ? '100%' : prev ? pct(n / prev, 0) : '—'}</span>
                      <span className="ov-meta">{stage === 'DISBURSED' ? '' : avg !== null ? `prom. ${duration(avg)}` : 'sin datos'}</span>
                    </div>
                  );
                })}
              </div>
            </article>
            <article className="ov-card s4">
              <h2>Desistimiento</h2>
              <p className="ov-big">{leads ? pct(withdrawn.length / leads, 0) : '—'}</p>
              <p className="ov-sub">{withdrawn.length} de {leads} casos</p>
              {withdrawReasons.size > 0 && (
                <div className="ov-list" style={{ marginTop: 10 }}>
                  {[...withdrawReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => (
                    <div key={reason} className="ov-row"><div className="grow"><small>{reason}</small></div><strong>{count}</strong></div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </>
  );
}
