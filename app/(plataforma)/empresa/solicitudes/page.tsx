import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import { PageHeader, Status } from '@/components/ov/ui';
import { Pager } from '@/components/empresa/ui';
import { activeStaff } from '@/lib/empresa/access';
import { qs, sp, spEnum, spPage, type SearchParams } from '@/lib/empresa/params';
import { fechaHora, REQUEST_KINDS, REQUEST_STATUS, slaText } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Solicitudes' };

const PAGE_SIZE = 25;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT', 'RESOLVED', 'REJECTED'] as const;

export default async function SolicitudesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'request.manage' });
  const params = await searchParams;
  const status = spEnum(params, 'estado', STATUSES);
  const kind = spEnum(params, 'tipo', Object.keys(REQUEST_KINDS));
  const who = sp(params, 'resp');
  const overdue = sp(params, 'vencidas') === '1';
  const page = spPage(params);
  const now = new Date();

  const where: Prisma.ServiceRequestWhereInput = {
    status: status || { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] },
    ...(kind ? { kind } : {}),
    ...(who === 'yo' ? { assigneeId: session.user.id } : who === 'ninguno' ? { assigneeId: null } : /^[0-9a-f-]{36}$/i.test(who) ? { assigneeId: who } : {}),
    ...(overdue ? { slaDueAt: { lt: now } } : {}),
  };
  const prisma = getPrisma();
  const [total, requests, staff, overdueCount, openCount] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      orderBy: [{ slaDueAt: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { person: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { messages: true } } },
    }),
    activeStaff(),
    prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] }, slaDueAt: { lt: now } } }),
    prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] } } }),
  ]);
  const nameOf = (id: string | null) => (id ? staff.find((u) => u.id === id)?.name ?? 'Usuario inactivo' : 'Sin asignar');
  const base = { estado: status, tipo: kind, resp: who, vencidas: overdue ? '1' : '' };

  return (
    <>
      <PageHeader title="Solicitudes de clientes" subtitle="Ordenadas por vencimiento de SLA. Cada respuesta al cliente llega por la app y por correo." />
      <div className="ov-grid">
        <article className="ov-card s6"><div className="ov-eyebrow">Abiertas</div><div className="ov-big">{openCount}</div></article>
        <article className="ov-card s6"><div className="ov-eyebrow">Con SLA vencido</div><div className={overdueCount ? 'ov-big ov-negative' : 'ov-big'}>{overdueCount}</div></article>
      </div>
      <article className="ov-card" style={{ marginTop: 16 }}>
        <form method="get" className="ov-filters">
          <label className="ov-field"><span>Estado</span>
            <select name="estado" defaultValue={status}>
              <option value="">Abiertas (todas)</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s === 'WAITING_CLIENT' ? 'Esperando al cliente' : REQUEST_STATUS[s].label}</option>)}
            </select>
          </label>
          <label className="ov-field"><span>Tipo</span>
            <select name="tipo" defaultValue={kind}>
              <option value="">Todos</option>
              {Object.entries(REQUEST_KINDS).map(([code, k]) => <option key={code} value={code}>{k.label}</option>)}
            </select>
          </label>
          <label className="ov-field"><span>Responsable</span>
            <select name="resp" defaultValue={who}>
              <option value="">Todos</option>
              <option value="yo">Asignadas a mí</option>
              <option value="ninguno">Sin asignar</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="ov-check" style={{ alignSelf: 'center' }}><input type="checkbox" name="vencidas" value="1" defaultChecked={overdue} /><span>Solo vencidas</span></label>
          <button className="ov-btn ov-btn--secondary" type="submit">Filtrar</button>
        </form>
        {requests.length === 0 ? (
          <div className="ov-empty">No hay solicitudes con estos filtros.</div>
        ) : (
          <div className="ov-tablewrap">
            <table className="ov-table">
              <thead><tr><th>Solicitud</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Responsable</th><th>SLA</th></tr></thead>
              <tbody>
                {requests.map((r) => {
                  const closed = r.status === 'RESOLVED' || r.status === 'REJECTED';
                  const sla = closed ? { text: `Cerrada ${fechaHora(r.updatedAt)}`, tone: 'gray' } : slaText(r.slaDueAt, now.getTime());
                  return (
                    <tr key={r.id} className={!closed && sla.tone === 'bad' ? 'ove-row-bad' : undefined}>
                      <td><Link href={`/empresa/solicitudes/${r.id}`}><strong>{r.code}</strong></Link><small>{r.subject}</small></td>
                      <td><Link href={`/empresa/clientes/${r.person.id}`}>{r.person.firstName} {r.person.lastName}</Link><small>{r._count.messages} mensajes</small></td>
                      <td>{REQUEST_KINDS[r.kind]?.label ?? r.kind}</td>
                      <td><Status tone={REQUEST_STATUS[r.status].tone}>{r.status === 'WAITING_CLIENT' ? 'Esperando al cliente' : REQUEST_STATUS[r.status].label}</Status></td>
                      <td>{nameOf(r.assigneeId)}</td>
                      <td><Status tone={sla.tone}>{sla.text}</Status><small>{fechaHora(r.slaDueAt)}</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(p) => `/empresa/solicitudes${qs(base, { p })}`} />
      </article>
    </>
  );
}
