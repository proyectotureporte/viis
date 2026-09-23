import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import type { Stage } from '@/app/generated/prisma/enums';
import { Empty, PageHeader, Status } from '@/components/ov/ui';
import { allyCases, isAllyAdmin, maskedDocument, missingByCase, personName } from '@/lib/aliado/scope';
import { fecha, money, PRODUCTS, slaText, STAGE_LABELS, STAGES } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Clientes' };

const PAGE_SIZE = 50;

function searchFilter(q: string): Prisma.OpportunityWhereInput | undefined {
  const text = q.trim().slice(0, 80);
  if (!text) return undefined;
  if (/^\d{4}$/.test(text)) return { OR: [{ person: { documentLast4: text } }, { code: { contains: text, mode: 'insensitive' } }] };
  if (/^ov-?\d+$/i.test(text)) return { code: { contains: text.toUpperCase().replace(/^OV(\d)/, 'OV-$1'), mode: 'insensitive' } };
  const tokens = text.split(/\s+/).filter(Boolean).slice(0, 4);
  return {
    AND: tokens.map((token) => ({
      OR: [
        { person: { firstName: { contains: token, mode: 'insensitive' as const } } },
        { person: { lastName: { contains: token, mode: 'insensitive' as const } } },
      ],
    })),
  };
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; etapa?: string; p?: string }> }) {
  const session = await requireUser({ portal: 'aliado', permission: 'case.read' });
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const stage = STAGES.includes(params.etapa as Stage) ? (params.etapa as Stage) : undefined;
  const page = Math.max(1, Math.min(200, Number(params.p) || 1));
  const admin = isAllyAdmin(session.user);

  const where: Prisma.OpportunityWhereInput = {
    AND: [allyCases(session.user), ...(stage ? [{ stage }] : []), ...(searchFilter(q) ? [searchFilter(q)!] : [])],
  };
  const prisma = getPrisma();
  const [total, cases] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        person: { select: { firstName: true, lastName: true, documentType: true, documentLast4: true } },
        allyUser: { select: { name: true } },
        entity: { select: { name: true } },
      },
    }),
  ]);
  const missing = await missingByCase(
    prisma,
    cases.filter((c) => ['PROFILED', 'DOCUMENTING', 'CONTACTED'].includes(c.stage)),
  );
  const now = new Date().getTime();
  const query = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (stage) sp.set('etapa', stage);
    if (p > 1) sp.set('p', String(p));
    return `/aliado/clientes${sp.size ? `?${sp}` : ''}`;
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={admin ? 'Casos de toda tu organización.' : 'Tus casos y lo que necesita cada uno.'}
        actions={<Link className="ov-btn" href="/aliado/clientes/nuevo">+ Nuevo cliente</Link>}
      />
      <form className="ov-filters" role="search" action="/aliado/clientes">
        <label className="ov-field" style={{ flex: '1 1 260px' }}>
          <span>Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nombre, código OV-1001 o últimos 4 del documento" maxLength={80} />
        </label>
        <label className="ov-field">
          <span>Etapa</span>
          <select name="etapa" defaultValue={stage ?? ''}>
            <option value="">Todas</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>
        <button className="ov-btn ov-btn--secondary" type="submit">Filtrar</button>
        {(q || stage) && <Link href="/aliado/clientes" className="ov-linkbtn">Limpiar</Link>}
      </form>

      {cases.length === 0 ? (
        <Empty>
          {q || stage ? (
            <>No encontramos casos con ese filtro. <Link href="/aliado/clientes">Ver todos</Link></>
          ) : (
            <>Aún no tienes clientes registrados. <Link href="/aliado/clientes/nuevo">Registra el primero</Link> con su autorización de datos: el sistema revisa que no esté duplicado y lo protege a tu nombre durante 180 días.</>
          )}
        </Empty>
      ) : (
        <article className="ov-card ov-tablewrap">
          <p className="ov-meta" style={{ margin: '0 0 8px' }}>{total === 1 ? '1 caso' : `${total} casos`}</p>
          <table className="ov-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Producto</th>
                <th>Etapa</th>
                <th>Pendiente</th>
                <th>SLA</th>
                <th className="num">Valor</th>
                {admin && <th>Aliado</th>}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const sla = ['WITHDRAWN', 'DISBURSED', 'POSTSALE'].includes(c.stage) ? null : slaText(c.slaDueAt, now);
                const faltan = missing.get(c.id) ?? [];
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/aliado/clientes/${c.id}`}><strong>{personName(c.person)}</strong></Link>
                      <small>{c.code} · {maskedDocument(c.person)} · actualizado {fecha(c.updatedAt)}</small>
                    </td>
                    <td>{PRODUCTS[c.product] ?? c.product}{c.entity && <small>{c.entity.name}</small>}</td>
                    <td><Status tone={c.stage === 'WITHDRAWN' ? 'bad' : ['DISBURSED', 'POSTSALE'].includes(c.stage) ? 'ok' : 'wait'}>{STAGE_LABELS[c.stage]}</Status></td>
                    <td>
                      {faltan.length > 0 ? <>{faltan.length === 1 ? '1 documento' : `${faltan.length} documentos`}<small>{faltan.slice(0, 2).join(', ')}{faltan.length > 2 ? '…' : ''}</small></> : c.nextAction ?? '—'}
                    </td>
                    <td>{sla ? <span className={sla.tone === 'bad' ? 'ov-negative' : sla.tone === 'wait' ? 'ov-sub' : 'ov-meta'}>{sla.text}</span> : '—'}</td>
                    <td className="num ov-money">{c.disbursedAmount ? money(c.disbursedAmount, true) : c.amount ? money(c.amount, true) : '—'}</td>
                    {admin && <td>{c.allyUser?.name ?? 'Sin asignar'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > PAGE_SIZE && (
            <div className="ov-actions">
              {page > 1 && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={query(page - 1)}>← Anteriores</Link>}
              <span className="ov-meta">Página {page} de {Math.ceil(total / PAGE_SIZE)}</span>
              {page * PAGE_SIZE < total && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={query(page + 1)}>Siguientes →</Link>}
            </div>
          )}
        </article>
      )}
    </>
  );
}
