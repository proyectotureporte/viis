import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import type { Priority, Stage } from '@/app/generated/prisma/enums';
import { ActionForm } from '@/components/ov/forms';
import { Empty, PageHeader, Status } from '@/components/ov/ui';
import { CheckAll, OpButton } from '@/components/empresa/FormBits';
import { Pager } from '@/components/empresa/ui';
import { activeStaff } from '@/lib/empresa/access';
import { fullName, qs, sp, spEnum, spPage, spUuid, type SearchParams } from '@/lib/empresa/params';
import { fecha, money, PRIORITY_LABELS, PRODUCTS, slaText, STAGE_LABELS, STAGES } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { can, caseScope, ROLE_LABELS } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { bandejaAction } from './actions';

export const metadata: Metadata = { title: 'Bandeja operativa' };

const PAGE_SIZE = 25;
const CLOSED: Stage[] = ['WITHDRAWN', 'DISBURSED', 'POSTSALE'];
const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const CHANNELS = ['DIRECTO', 'ALIADO', 'WEB'] as const;

export default async function BandejaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'case.read' });
  const params = await searchParams;
  const prisma = getPrisma();

  const filters = {
    etapa: spEnum(params, 'etapa', STAGES),
    producto: spEnum(params, 'producto', Object.keys(PRODUCTS)),
    responsable: sp(params, 'responsable') === 'none' ? 'none' : spUuid(params, 'responsable'),
    entidad: spUuid(params, 'entidad'),
    canal: spEnum(params, 'canal', CHANNELS),
    prioridad: spEnum(params, 'prioridad', PRIORITIES),
    vencidos: sp(params, 'vencidos') === '1' ? '1' : '',
    q: sp(params, 'q').slice(0, 80),
  };
  const page = spPage(params);
  const now = new Date();

  const and: Prisma.OpportunityWhereInput[] = [caseScope(session.user)];
  and.push(filters.etapa ? { stage: filters.etapa } : { stage: { notIn: CLOSED } });
  if (filters.producto) and.push({ product: filters.producto });
  if (filters.responsable === 'none') and.push({ assigneeId: null });
  else if (filters.responsable) and.push({ assigneeId: filters.responsable });
  if (filters.entidad) and.push({ entityId: filters.entidad });
  if (filters.canal) and.push({ channel: filters.canal });
  if (filters.prioridad) and.push({ priority: filters.prioridad });
  if (filters.vencidos) and.push({ slaDueAt: { lt: now } });
  if (filters.q) {
    const words = filters.q.split(/\s+/).filter(Boolean).slice(0, 4);
    const or: Prisma.OpportunityWhereInput[] = [{ code: { contains: filters.q, mode: 'insensitive' } }];
    if (/^\d{4}$/.test(filters.q)) or.push({ person: { documentLast4: filters.q } });
    or.push({ AND: words.map((w) => ({ OR: [{ person: { firstName: { contains: w, mode: 'insensitive' as const } } }, { person: { lastName: { contains: w, mode: 'insensitive' as const } } }] })) });
    and.push({ OR: or });
  }
  const where: Prisma.OpportunityWhereInput = { AND: and };
  const urgentWhere: Prisma.OpportunityWhereInput = { AND: [...and, { priority: { in: ['CRITICAL', 'HIGH'] } }] };
  const restWhere: Prisma.OpportunityWhereInput = { AND: [...and, { priority: { in: ['NORMAL', 'LOW'] } }] };

  // Orden: primero CRITICAL/HIGH (por prioridad y SLA), luego el resto por SLA más próximo.
  const [total, urgentTotal, overdueTotal, staff, entities] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.count({ where: urgentWhere }),
    prisma.opportunity.count({ where: { AND: [...and, { slaDueAt: { lt: now } }] } }),
    activeStaff(),
    prisma.entity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const offset = (page - 1) * PAGE_SIZE;
  const include = {
    person: { select: { firstName: true, lastName: true, documentLast4: true } },
    assignee: { select: { name: true } },
    entity: { select: { name: true } },
    allyOrg: { select: { name: true } },
  } satisfies Prisma.OpportunityInclude;
  const urgentTake = Math.max(0, Math.min(PAGE_SIZE, urgentTotal - offset));
  const [urgent, rest] = await Promise.all([
    urgentTake > 0
      ? prisma.opportunity.findMany({ where: urgentWhere, include, orderBy: [{ priority: 'desc' }, { slaDueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], skip: offset, take: urgentTake })
      : Promise.resolve([]),
    PAGE_SIZE - urgentTake > 0
      ? prisma.opportunity.findMany({ where: restWhere, include, orderBy: [{ slaDueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], skip: Math.max(0, offset - urgentTotal), take: PAGE_SIZE - urgentTake })
      : Promise.resolve([]),
  ]);
  const rows = [...urgent, ...rest];

  // Carga por responsable (casos abiertos en alcance).
  const load = await prisma.opportunity.groupBy({ by: ['assigneeId'], where: { AND: [caseScope(session.user), { stage: { notIn: CLOSED } }] }, _count: { _all: true } });
  const overdueLoad = await prisma.opportunity.groupBy({ by: ['assigneeId'], where: { AND: [caseScope(session.user), { stage: { notIn: CLOSED } }, { slaDueAt: { lt: now } }] }, _count: { _all: true } });
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const loadRows = load
    .map((l) => ({ id: l.assigneeId, name: l.assigneeId ? staffName.get(l.assigneeId) ?? 'Usuario inactivo' : 'Sin responsable', count: l._count._all, overdue: overdueLoad.find((o) => o.assigneeId === l.assigneeId)?._count._all ?? 0 }))
    .sort((a, b) => b.count - a.count);

  const canAssign = can(session.user.role, 'case.assign');
  const canStage = can(session.user.role, 'case.stage');
  const base = { ...filters };
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Bandeja operativa"
        subtitle={`Casos priorizados por urgencia y SLA${session.user.role === 'ADVISOR' ? ' · ves tus casos y los que no tienen responsable' : ''}.`}
        actions={can(session.user.role, 'case.create') ? <Link className="ov-btn" href="/empresa/casos/nuevo">+ Nuevo caso</Link> : undefined}
      />

      <form className="ov-filters" method="get" role="search" aria-label="Filtrar casos">
        <label className="ov-field"><span>Buscar</span><input name="q" defaultValue={filters.q} placeholder="OV-1001, nombre o últimos 4" /></label>
        <label className="ov-field"><span>Etapa</span>
          <select name="etapa" defaultValue={filters.etapa}>
            <option value="">Abiertos (todas)</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Prioridad</span>
          <select name="prioridad" defaultValue={filters.prioridad}>
            <option value="">Todas</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p].label}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Producto</span>
          <select name="producto" defaultValue={filters.producto}>
            <option value="">Todos</option>
            {Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Responsable</span>
          <select name="responsable" defaultValue={filters.responsable}>
            <option value="">Todos</option>
            <option value="none">Sin responsable</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Entidad</span>
          <select name="entidad" defaultValue={filters.entidad}>
            <option value="">Todas</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Canal</span>
          <select name="canal" defaultValue={filters.canal}>
            <option value="">Todos</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{c === 'DIRECTO' ? 'Directo' : c === 'ALIADO' ? 'Aliado' : 'Web'}</option>)}
          </select>
        </label>
        <label className="ov-check" style={{ alignSelf: 'center' }}><input type="checkbox" name="vencidos" value="1" defaultChecked={Boolean(filters.vencidos)} /><span>Solo SLA vencido</span></label>
        <button className="ov-btn ov-btn--secondary" type="submit">Filtrar</button>
        {hasFilters && <Link href="/empresa/bandeja" className="ov-btn ov-btn--ghost">Limpiar</Link>}
      </form>

      <p className="ov-meta" style={{ marginTop: -4 }}>
        {total.toLocaleString('es-CO')} caso(s) · {urgentTotal} con prioridad alta o crítica · {overdueTotal > 0 ? <strong className="ov-negative">{overdueTotal} con SLA vencido</strong> : 'ninguno con SLA vencido'}
      </p>

      <article className="ov-card s12" style={{ marginTop: 10 }}>
        {rows.length === 0 ? (
          <Empty>{hasFilters ? 'Ningún caso coincide con los filtros. Prueba quitando alguno.' : 'No hay casos abiertos en tu bandeja. Los nuevos casos y leads convertidos aparecerán aquí.'}</Empty>
        ) : (
          <ActionForm action={bandejaAction} className="">
            {(canAssign || canStage) && (
              <div className="ove-bulk" aria-label="Acciones sobre los casos seleccionados">
                {canAssign && (
                  <>
                    <label className="ov-field"><span>Asignar seleccionados a</span>
                      <select name="assigneeId" defaultValue="">
                        <option value="" disabled>Elige responsable…</option>
                        <option value="none">Quitar responsable</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {ROLE_LABELS[s.role]}</option>)}
                      </select>
                    </label>
                    <OpButton value="bulk-assign" className="ov-btn ov-btn--small">Asignar</OpButton>
                  </>
                )}
                {canStage && (
                  <>
                    <label className="ov-field"><span>Motivo de escalamiento</span><input name="reason" maxLength={300} placeholder="Ej.: entidad no responde" /></label>
                    <OpButton value="bulk-escalate" confirm="¿Escalar los casos seleccionados? Se notificará a coordinación.">Escalar</OpButton>
                  </>
                )}
              </div>
            )}
            <div className="ov-tablewrap">
              <table className="ov-table">
                <thead>
                  <tr>
                    <th className="ove-table-check"><CheckAll /></th>
                    <th>Prioridad</th>
                    <th>Caso</th>
                    <th>Etapa</th>
                    <th>Responsable</th>
                    <th>SLA</th>
                    <th>Entidad · canal</th>
                    <th className="num">Monto</th>
                    <th><span className="ove-sr">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const sla = slaText(o.slaDueAt, now.getTime());
                    return (
                      <tr key={o.id} className={sla.tone === 'bad' ? 'ove-row-bad' : sla.tone === 'wait' ? 'ove-row-warn' : undefined}>
                        <td className="ove-table-check"><input type="checkbox" name="ids" value={o.id} aria-label={`Seleccionar ${o.code}`} /></td>
                        <td>
                          <Status tone={PRIORITY_LABELS[o.priority].tone}>{PRIORITY_LABELS[o.priority].label}</Status>
                          {o.escalatedAt && <small>Escalado {fecha(o.escalatedAt)}</small>}
                        </td>
                        <td>
                          <Link href={`/empresa/casos/${o.id}`}><strong>{o.code}</strong> · {fullName(o.person)}</Link>
                          <small>{PRODUCTS[o.product] ?? o.product}{o.nextAction ? ` · ${o.nextAction}` : ''}</small>
                        </td>
                        <td>{STAGE_LABELS[o.stage]}<small>desde {fecha(o.stageAt)}</small></td>
                        <td>{o.assignee?.name ?? <span className="ov-meta">Sin responsable</span>}</td>
                        <td><Status tone={sla.tone}>{sla.text}</Status></td>
                        <td>{o.entity?.name ?? <span className="ov-meta">Sin entidad</span>}<small>{o.channel === 'ALIADO' ? `Aliado${o.allyOrg ? ` · ${o.allyOrg.name}` : ''}` : o.channel === 'WEB' ? 'Web' : 'Directo'}</small></td>
                        <td className="num">{o.amount ? money(o.amount, true) : '—'}</td>
                        <td>{canStage && !o.assigneeId && <OpButton value={`take:${o.id}`}>Tomar</OpButton>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ActionForm>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(p) => `/empresa/bandeja${qs(base, { p })}`} />
      </article>

      {loadRows.length > 0 && (
        <article className="ov-card s12" style={{ marginTop: 16 }}>
          <h2>Carga por responsable</h2>
          <div className="ov-tablewrap">
            <table className="ov-table" style={{ minWidth: 420 }}>
              <thead><tr><th>Responsable</th><th className="num">Casos abiertos</th><th className="num">SLA vencido</th><th /></tr></thead>
              <tbody>
                {loadRows.map((r) => (
                  <tr key={r.id ?? 'none'}>
                    <td>{r.name}</td>
                    <td className="num">{r.count}</td>
                    <td className="num">{r.overdue ? <span className="ov-negative">{r.overdue}</span> : 0}</td>
                    <td><Link href={`/empresa/bandeja${qs({ responsable: r.id ?? 'none' })}`}>Ver casos</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </>
  );
}
