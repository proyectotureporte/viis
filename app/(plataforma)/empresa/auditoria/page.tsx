import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Empty, PageHeader } from '@/components/ov/ui';
import { JsonBlock } from '@/components/empresa/ui';
import { qs, sp, type SearchParams } from '@/lib/empresa/params';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { ROLE_LABELS } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import type { Role } from '@/app/generated/prisma/enums';
import { verifyChainAction } from './actions';
import { auditWhere, readAuditFilters } from './filters';

export const metadata: Metadata = { title: 'Auditoría' };

const PAGE = 50;

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser({ portal: 'empresa', permission: 'audit.read' });
  const params = await searchParams;
  const filters = readAuditFilters(params);
  const antes = /^\d{1,19}$/.test(sp(params, 'antes')) ? BigInt(sp(params, 'antes')) : null;
  const despues = !antes && /^\d{1,19}$/.test(sp(params, 'despues')) ? BigInt(sp(params, 'despues')) : null;
  const prisma = getPrisma();
  const where = await auditWhere(filters);

  let events;
  if (despues) {
    // Página más reciente: se leen ascendente desde el cursor y se invierten.
    events = (await prisma.auditEvent.findMany({ where: { ...where, id: { gt: despues } }, orderBy: { id: 'asc' }, take: PAGE + 1 })).reverse();
  } else {
    events = await prisma.auditEvent.findMany({ where: antes ? { ...where, id: { lt: antes } } : where, orderBy: { id: 'desc' }, take: PAGE + 1 });
  }
  let hasOlder: boolean;
  let hasNewer: boolean;
  if (despues) {
    hasNewer = events.length > PAGE;
    if (hasNewer) events = events.slice(1);
    hasOlder = true;
  } else {
    hasOlder = events.length > PAGE;
    if (hasOlder) events = events.slice(0, PAGE);
    hasNewer = Boolean(antes);
  }

  const [entities, actors] = await Promise.all([
    prisma.auditEvent.groupBy({ by: ['entity'], orderBy: { entity: 'asc' } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(events.map((e) => e.actorId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true, email: true } }),
  ]);
  const actorById = new Map(actors.map((a) => [a.id, a]));
  const base = { ...filters } as Record<string, string>;
  const newest = events[0]?.id;
  const oldest = events[events.length - 1]?.id;

  return (
    <>
      <PageHeader
        title="Auditoría"
        subtitle="Bitácora inmutable encadenada por hash: consultas, cambios, decisiones y exportaciones."
        actions={<a className="ov-btn ov-btn--secondary" href={`/api/empresa/auditoria/csv${qs(base)}`}>Exportar CSV</a>}
      />
      <div className="ov-grid">
        <article className="ov-card s12">
          <header>
            <h2>Integridad de la cadena</h2>
          </header>
          <p className="ov-meta">Recalcula el hash de cada evento desde el primero. Si alguien alteró o borró un registro, se detecta el eslabón exacto. La verificación también queda auditada.</p>
          <ActionForm action={verifyChainAction} className="ove-inline-form">
            <SubmitButton pendingText="Verificando…">Verificar integridad de la cadena</SubmitButton>
          </ActionForm>
        </article>
        <article className="ov-card s12">
          <form className="ov-filters" method="get">
            <label className="ov-field"><span>Acción contiene</span><input name="accion" defaultValue={filters.accion} placeholder="case.stage" /></label>
            <label className="ov-field"><span>Entidad</span>
              <select name="entidad" defaultValue={filters.entidad}>
                <option value="">Todas</option>
                {entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}
              </select>
            </label>
            <label className="ov-field"><span>Id de la entidad</span><input name="id" defaultValue={filters.id} /></label>
            <label className="ov-field"><span>Actor (correo o id)</span><input name="actor" defaultValue={filters.actor} /></label>
            <label className="ov-field"><span>Desde</span><input type="date" name="desde" defaultValue={filters.desde} /></label>
            <label className="ov-field"><span>Hasta</span><input type="date" name="hasta" defaultValue={filters.hasta} /></label>
            <button className="ov-btn ov-btn--secondary" type="submit">Buscar</button>
            <Link className="ov-linkbtn" href="/empresa/auditoria">Limpiar</Link>
          </form>
          {events.length === 0 ? (
            <Empty>No hay eventos con estos filtros.</Empty>
          ) : (
            <div className="ov-tablewrap">
              <table className="ov-table">
                <thead>
                  <tr><th>#</th><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Canal</th><th>Detalle</th></tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const actor = e.actorId ? actorById.get(e.actorId) : null;
                    return (
                      <tr key={e.id.toString()}>
                        <td className="num">{e.id.toString()}</td>
                        <td>{fechaHora(e.at)}</td>
                        <td>
                          {actor ? actor.name : e.actorId ? <span className="ov-mono">{e.actorId.slice(0, 8)}</span> : 'Sistema'}
                          <small>{actor?.email}{e.actorRole ? ` · ${ROLE_LABELS[e.actorRole as Role] ?? e.actorRole}` : ''}</small>
                        </td>
                        <td><span className="ov-mono">{e.action}</span></td>
                        <td>
                          {e.entity}
                          {e.entityId && (
                            <small>
                              {e.entity === 'Opportunity' ? <Link href={`/empresa/casos/${e.entityId}`} className="ov-mono">{e.entityId}</Link> : <span className="ov-mono">{e.entityId}</span>}
                            </small>
                          )}
                        </td>
                        <td>{e.channel}</td>
                        <td style={{ minWidth: 220 }}>
                          {e.before || e.after ? (
                            <details className="ov-details">
                              <summary>Ver datos</summary>
                              {e.before != null && <><small>Antes</small><JsonBlock value={e.before} /></>}
                              {e.after != null && <><small>Después</small><JsonBlock value={e.after} /></>}
                            </details>
                          ) : <span className="ov-meta">—</span>}
                          <small className="ov-mono" title={e.hash}>hash {e.hash.slice(0, 12)}…</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <nav className="ove-pager" aria-label="Paginación">
            <span className="ov-meta">{events.length} eventos en esta página</span>
            <div>
              {hasNewer && newest !== undefined ? <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`/empresa/auditoria${qs(base, { despues: newest.toString() })}`}>← Más recientes</Link> : null}
              {hasOlder && oldest !== undefined ? <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`/empresa/auditoria${qs(base, { antes: oldest.toString() })}`}>Más antiguos →</Link> : null}
            </div>
          </nav>
        </article>
      </div>
    </>
  );
}
