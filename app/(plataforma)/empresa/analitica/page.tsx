import type { Metadata } from 'next';
import { Empty, Kpi, PageHeader } from '@/components/ov/ui';
import { Bars, DateRangeForm, Funnel, Stack } from '@/components/empresa/ui';
import { addDaysYmd, bogotaDayEnd, bogotaDayStart, dateRange, type SearchParams } from '@/lib/empresa/params';
import { fechaDia, money, PAYMENT_STATUS, pct, PIPELINE_STAGES, REQUEST_KINDS, STAGE_LABELS, STAGE_SLA_HOURS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import type { Stage } from '@/app/generated/prisma/enums';
import { conversion, funnel, northMetric, paymentTimes, stageTimes, type ConversionRow } from './queries';

export const metadata: Metadata = { title: 'Analítica' };

const CHANNEL_LABELS: Record<string, string> = { DIRECTO: 'Directo (asesor)', ALIADO: 'Aliados', WEB: 'Web' };
const NORTH_WINDOW_DAYS = 90;

function ratio(n: number, d: number): string {
  return d > 0 ? pct(n / d) : '—';
}

function hours(h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(h)) return '—';
  if (h < 48) return `${h.toLocaleString('es-CO', { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString('es-CO', { maximumFractionDigits: 1 })} d`;
}

function ConversionTable({ title, rows, name }: { title: string; rows: ConversionRow[]; name: (key: string | null) => string }) {
  const sorted = [...rows].sort((a, b) => b.disbursed - a.disbursed || b.total - a.total);
  return (
    <article className="ov-card s12">
      <h2>{title}</h2>
      {sorted.length === 0 ? <Empty>Sin casos creados en el periodo.</Empty> : (
        <div className="ov-tablewrap">
          <table className="ov-table">
            <thead><tr><th>Origen</th><th className="num">Casos</th><th className="num">Radicados</th><th className="num">Desembolsados</th><th className="num">Creado → desembolso</th><th className="num">Radicado → desembolso</th><th className="num">Monto desembolsado</th></tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`${r.dim}-${r.key ?? 'none'}`}>
                  <td>{name(r.key)}</td>
                  <td className="num">{r.total}</td>
                  <td className="num">{r.filed}</td>
                  <td className="num">{r.disbursed}</td>
                  <td className="num">{ratio(r.disbursed, r.total)}</td>
                  <td className="num">{ratio(r.disbursed, r.filed)}</td>
                  <td className="num ov-money">{money(r.disbursedAmount, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default async function AnaliticaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser({ portal: 'empresa', permission: 'analytics.read' });
  const range = dateRange(await searchParams, 90);
  const { start, end } = range;
  const prisma = getPrisma();
  const now = new Date();
  const northEnd = bogotaDayEnd(range.to);
  const northStart = bogotaDayStart(addDaysYmd(range.to, -(NORTH_WINDOW_DAYS - 1)));

  const [funnelRows, conv, times, overdueByStage, docsReviewed, docsApprovedFirst, rejectsByType, withdrawn, paymentsByStatus, payTimes, requestsResolved, requestsOverdue, north] = await Promise.all([
    funnel(start, end),
    conversion(start, end),
    stageTimes(start, end),
    prisma.opportunity.groupBy({ by: ['stage'], where: { slaDueAt: { lt: now }, stage: { notIn: ['WITHDRAWN', 'DISBURSED', 'POSTSALE'] } }, _count: { _all: true } }),
    prisma.document.groupBy({ by: ['status'], where: { reviewedAt: { gte: start, lt: end }, status: { in: ['APPROVED', 'REJECTED'] } }, _count: { _all: true } }),
    prisma.document.count({ where: { reviewedAt: { gte: start, lt: end }, status: 'APPROVED', version: 1 } }),
    prisma.document.groupBy({ by: ['typeId'], where: { reviewedAt: { gte: start, lt: end }, status: 'REJECTED' }, _count: { _all: true }, orderBy: { _count: { typeId: 'desc' } }, take: 6 }),
    prisma.opportunity.groupBy({ by: ['withdrawReason'], where: { stage: 'WITHDRAWN', stageAt: { gte: start, lt: end } }, _count: { _all: true }, orderBy: { _count: { withdrawReason: 'desc' } }, take: 10 }),
    prisma.paymentReport.groupBy({ by: ['status'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
    paymentTimes(start, end),
    prisma.serviceRequest.findMany({ where: { status: 'RESOLVED', updatedAt: { gte: start, lt: end } }, select: { kind: true, updatedAt: true, slaDueAt: true } }),
    prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] }, slaDueAt: { lt: now } } }),
    northMetric(northStart, northEnd),
  ]);

  // Nombres para las dimensiones.
  const allyIds = conv.filter((r) => r.dim === 'ally' && r.key).map((r) => r.key!);
  const entityIds = conv.filter((r) => r.dim === 'entity' && r.key).map((r) => r.key!);
  const typeIds = rejectsByType.map((r) => r.typeId);
  const [orgs, entities, types] = await Promise.all([
    prisma.organization.findMany({ where: { id: { in: allyIds } }, select: { id: true, name: true } }),
    prisma.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } }),
    prisma.documentType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const entityName = new Map(entities.map((e) => [e.id, e.name]));
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  // Embudo acumulado: un caso que llegó a la etapa k también pasó por las anteriores.
  const reached = PIPELINE_STAGES.map((stage, i) => ({
    label: STAGE_LABELS[stage],
    value: funnelRows.filter((r) => r.idx >= i + 1).reduce((a, r) => a + r.n, 0),
  }));
  const created = reached[0]?.value ?? 0;
  const filed = reached[4]?.value ?? 0;
  const disbursed = reached[7]?.value ?? 0;
  const withdrawnCases = funnelRows.reduce((a, r) => a + r.withdrawn, 0);
  const channelRows = conv.filter((r) => r.dim === 'channel');
  const disbursedAmount = channelRows.reduce((a, r) => a + r.disbursedAmount, 0);

  const timesSorted = PIPELINE_STAGES.map((s) => times.find((t) => t.stage === s)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const slaClosed = times.reduce((a, t) => a + t.withSla, 0);
  const slaOk = times.reduce((a, t) => a + t.withinSla, 0);
  const overdueTotal = overdueByStage.reduce((a, r) => a + r._count._all, 0);

  const reviewedTotal = docsReviewed.reduce((a, r) => a + r._count._all, 0);
  const rejected = docsReviewed.find((r) => r.status === 'REJECTED')?._count._all ?? 0;
  const approved = docsReviewed.find((r) => r.status === 'APPROVED')?._count._all ?? 0;

  const payCount = (s: string) => paymentsByStatus.find((r) => r.status === s)?._count._all ?? 0;
  const payTotal = paymentsByStatus.reduce((a, r) => a + r._count._all, 0);

  const reqInSla = requestsResolved.filter((r) => r.updatedAt <= r.slaDueAt).length;

  const northPct = north.denominator > 0 ? north.numerator / north.denominator : null;

  return (
    <>
      <PageHeader title="Analítica" subtitle={`Del ${fechaDia(`${range.from}T00:00:00Z`)} al ${fechaDia(`${range.to}T00:00:00Z`)} · hora de Bogotá`} />
      <DateRangeForm from={range.from} to={range.to} />

      <div className="ov-grid">
        <article className="ov-card ov-action s12">
          <div className="ov-eyebrow">Métrica norte · ventana de {NORTH_WINDOW_DAYS} días hasta el {fechaDia(`${range.to}T00:00:00Z`)}</div>
          <h2>{northPct === null ? 'Aún no hay hogares activos' : `${pct(northPct)} de los hogares activos completó una acción financiera beneficiosa y verificable`}</h2>
          <p>{north.numerator.toLocaleString('es-CO')} de {north.denominator.toLocaleString('es-CO')} hogares activos. Mide valor real para el hogar, no uso de pantallas.</p>
        </article>
        <article className="ov-card s7">
          <h2>Acciones que cuentan para la métrica norte</h2>
          {north.numerator === 0 ? <Empty>Ningún hogar activo registra todavía acciones verificables en la ventana.</Empty> : <Stack rows={north.byKind.filter((k) => k.n > 0).map((k) => ({ label: k.label, value: k.n }))} />}
          <p className="ov-meta" style={{ marginTop: 10 }}>Un mismo hogar puede tener varias acciones; el total cuenta cada hogar una sola vez.</p>
        </article>
        <article className="ov-card s5">
          <h2>Cómo se calcula</h2>
          <ul className="ove-metric-def">
            <li><strong>Hogar</strong>: se aproxima por la persona titular del expediente (el esquema aún no agrupa miembros de un hogar).</li>
            <li><strong>Activo</strong>: tiene usuario activo en la plataforma, un crédito activo o un caso no desistido.</li>
            <li><strong>Acción beneficiosa y verificable</strong> en los últimos {NORTH_WINDOW_DAYS} días: abono a capital validado por operación; oferta aceptada con evidencia; compra de cartera desembolsada; solicitud por dificultad de pago resuelta (prevención temprana); documento del inmueble aprobado (tradición y libertad, avalúo o póliza); o escenario guardado que el cliente convirtió en una solicitud (decisión informada).</li>
            <li>Solo cuentan hechos validados por el equipo o registrados con evidencia, nunca simples visitas o simulaciones sueltas.</li>
          </ul>
        </article>
      </div>

      <div className="ov-grid">
        <Kpi label="Casos creados" value={created.toLocaleString('es-CO')} sub={`${withdrawnCases} desistidos`} />
        <Kpi label="Desembolsados" value={disbursed.toLocaleString('es-CO')} sub={money(disbursedAmount, true)} />
        <Kpi label="Radicado → desembolso" value={ratio(disbursed, filed)} sub={`${filed} radicados · de creados ${ratio(disbursed, created)}`} />
        <Kpi label="Etapas dentro de SLA" value={ratio(slaOk, slaClosed)} sub={`${slaOk} de ${slaClosed} etapas cerradas · ${overdueTotal} casos abiertos vencidos hoy`} tone={slaClosed && slaOk / slaClosed < 0.95 ? 'negative' : undefined} />
      </div>

      <div className="ov-grid">
        <article className="ov-card s6">
          <h2>Embudo por etapa</h2>
          <p className="ov-meta">Casos creados en el periodo según la etapa más avanzada que alcanzaron.</p>
          {created === 0 ? <Empty>Sin casos creados en el periodo.</Empty> : <Funnel rows={reached} />}
        </article>
        <article className="ov-card s6">
          <h2>Desistimiento por causa</h2>
          {withdrawn.length === 0 ? <Empty>Sin desistimientos en el periodo.</Empty> : (
            <Funnel rows={withdrawn.map((w) => ({ label: w.withdrawReason?.slice(0, 40) || 'Sin causa', value: w._count._all, hint: w.withdrawReason ?? undefined }))} />
          )}
        </article>
      </div>

      <div className="ov-grid">
        <article className="ov-card s12">
          <h2>Tiempo por etapa</h2>
          <p className="ov-meta">Tiempo entre la entrada a una etapa y el siguiente cambio del mismo caso, para etapas cerradas en el periodo. SLA según el parámetro operativo de cada etapa.</p>
          {timesSorted.length === 0 ? <Empty>Aún no hay etapas cerradas en el periodo.</Empty> : (
            <>
              <Bars caption="Tiempo promedio por etapa en horas" rows={timesSorted.map((t) => ({ label: STAGE_LABELS[t.stage as Stage] ?? t.stage, value: Math.round(t.avgH) }))} format={(n) => hours(n)} />
              <div className="ov-tablewrap" style={{ marginTop: 12 }}>
                <table className="ov-table">
                  <thead><tr><th>Etapa</th><th className="num">Etapas cerradas</th><th className="num">Promedio</th><th className="num">Mediana</th><th className="num">SLA</th><th className="num">Dentro de SLA</th><th className="num">Abiertos vencidos</th></tr></thead>
                  <tbody>
                    {timesSorted.map((t) => (
                      <tr key={t.stage}>
                        <td>{STAGE_LABELS[t.stage as Stage] ?? t.stage}</td>
                        <td className="num">{t.n}</td>
                        <td className="num">{hours(t.avgH)}</td>
                        <td className="num">{hours(t.medH)}</td>
                        <td className="num">{STAGE_SLA_HOURS[t.stage as Stage] ? `${STAGE_SLA_HOURS[t.stage as Stage]} h` : '—'}</td>
                        <td className="num">{t.withSla ? ratio(t.withinSla, t.withSla) : '—'}</td>
                        <td className="num">{overdueByStage.find((o) => o.stage === t.stage)?._count._all ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>
      </div>

      <div className="ov-grid">
        <ConversionTable title="Conversión por canal" rows={channelRows} name={(k) => CHANNEL_LABELS[k ?? ''] ?? k ?? 'Sin canal'} />
        <ConversionTable title="Conversión por aliado" rows={conv.filter((r) => r.dim === 'ally')} name={(k) => (k ? orgName.get(k) ?? 'Aliado' : 'Sin aliado (directo o web)')} />
        <ConversionTable title="Conversión por entidad financiera" rows={conv.filter((r) => r.dim === 'entity')} name={(k) => (k ? entityName.get(k) ?? 'Entidad' : 'Sin entidad asignada')} />
      </div>

      <div className="ov-grid">
        <article className="ov-card s4">
          <h2>Calidad documental</h2>
          {reviewedTotal === 0 ? <Empty>Sin documentos revisados en el periodo.</Empty> : (
            <>
              <div className="ove-kv">
                <div><small>Revisados</small><strong>{reviewedTotal}</strong></div>
                <div><small>Tasa de rechazo</small><strong>{ratio(rejected, reviewedTotal)}</strong></div>
                <div><small>Aprobados a la primera</small><strong>{ratio(docsApprovedFirst, approved)}</strong></div>
              </div>
              <p className="ov-meta">&quot;A la primera&quot;: aprobados en su versión 1 sobre el total de aprobados.</p>
              {rejectsByType.length > 0 && (
                <>
                  <h3 style={{ fontSize: 15, margin: '12px 0 8px' }}>Más rechazados</h3>
                  <Funnel rows={rejectsByType.map((r) => ({ label: typeName.get(r.typeId) ?? 'Tipo', value: r._count._all }))} />
                </>
              )}
            </>
          )}
        </article>
        <article className="ov-card s4">
          <h2>Pagos reportados</h2>
          {payTotal === 0 ? <Empty>Sin pagos reportados en el periodo.</Empty> : (
            <>
              <Stack rows={['REPORTED', 'IN_REVIEW', 'VALIDATED', 'RECONCILED', 'REJECTED'].map((s) => ({ label: PAYMENT_STATUS[s].label, value: payCount(s) })).filter((r) => r.value > 0)} />
              <div className="ove-kv" style={{ marginTop: 12 }}>
                <div><small>Conciliados</small><strong>{ratio(payCount('RECONCILED'), payTotal)}</strong></div>
                <div><small>Tiempo medio de revisión</small><strong>{hours(payTimes.avgH)}</strong></div>
              </div>
            </>
          )}
        </article>
        <article className="ov-card s4">
          <h2>Solicitudes de clientes</h2>
          {requestsResolved.length === 0 && requestsOverdue === 0 ? <Empty>Sin solicitudes resueltas ni vencidas en el periodo.</Empty> : (
            <>
              <div className="ove-kv">
                <div><small>Resueltas</small><strong>{requestsResolved.length}</strong></div>
                <div><small>Dentro de SLA</small><strong>{ratio(reqInSla, requestsResolved.length)}</strong></div>
                <div><small>Abiertas vencidas hoy</small><strong>{requestsOverdue}</strong></div>
              </div>
              {requestsResolved.length > 0 && (
                <Funnel rows={Object.entries(requestsResolved.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {})).map(([k, v]) => ({ label: REQUEST_KINDS[k]?.label ?? k, value: v }))} />
              )}
              <p className="ov-meta">Aproximación: se toma la última actualización de la solicitud resuelta como fecha de resolución.</p>
            </>
          )}
        </article>
      </div>
    </>
  );
}
