import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import { PageHeader } from '@/components/ov/ui';
import { Pager } from '@/components/empresa/ui';
import { normalizeDocument } from '@/lib/consent';
import { qs, sp, spEnum, spPage, type SearchParams } from '@/lib/empresa/params';
import { DOCUMENT_TYPES_ID, fecha, STAGE_LABELS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { blindIndex } from '@/lib/security/crypto';
import { can, caseScope } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Clientes' };

const PAGE_SIZE = 20;
const DOC_TYPES = ['CC', 'CE', 'PA', 'PPT', 'NIT'] as const;

export default async function ClientesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'person.read' });
  const params = await searchParams;
  const q = sp(params, 'q');
  const docType = spEnum(params, 'tipo', DOC_TYPES);
  const docNumber = sp(params, 'doc').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const page = spPage(params);

  let where: Prisma.PersonWhereInput = {};
  let mode: 'doc' | 'text' | 'all' = 'all';
  if (docType && docNumber.length >= 4) {
    mode = 'doc';
    where = { documentIndex: blindIndex('doc', normalizeDocument(docType, docNumber)) };
  } else if (q) {
    mode = 'text';
    const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const or: Prisma.PersonWhereInput[] = [{ email: { contains: q, mode: 'insensitive' } }];
    if (/^\d{4}$/.test(q)) or.push({ documentLast4: q });
    or.push({ AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }] })) });
    where = { OR: or };
  }

  const scope = caseScope(session.user);
  const prisma = getPrisma();
  const [total, people] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, firstName: true, lastName: true, email: true, city: true, documentType: true, documentLast4: true, createdAt: true, userId: true,
        opportunities: { where: scope, select: { code: true, stage: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { opportunities: { where: scope }, loans: true, requests: true } },
      },
    }),
  ]);
  const base = { q, tipo: docType, doc: sp(params, 'doc') };

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Expediente único: busca por nombre, correo o últimos 4 dígitos, o por documento completo (búsqueda exacta sin descifrar)."
        actions={can(session.user.role, 'case.create') ? <Link className="ov-btn" href="/empresa/casos/nuevo">+ Nuevo caso</Link> : undefined}
      />
      <article className="ov-card">
        <form method="get" className="ov-filters" role="search">
          <label className="ov-field" style={{ flex: '1 1 260px' }}><span>Nombre, correo o últimos 4</span><input name="q" defaultValue={q} placeholder="Ej.: María Ruiz o 4821" /></label>
          <button className="ov-btn ov-btn--secondary" type="submit">Buscar</button>
        </form>
        <form method="get" className="ov-filters" role="search" aria-label="Búsqueda exacta por documento">
          <label className="ov-field"><span>Tipo</span>
            <select name="tipo" defaultValue={docType || 'CC'}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOCUMENT_TYPES_ID[t] ?? t}</option>)}
            </select>
          </label>
          <label className="ov-field"><span>Número completo</span><input name="doc" defaultValue={sp(params, 'doc')} inputMode="text" autoComplete="off" /></label>
          <button className="ov-btn ov-btn--secondary" type="submit">Buscar documento</button>
          {mode !== 'all' && <Link className="ov-btn ov-btn--ghost ov-btn--small" href="/empresa/clientes">Limpiar</Link>}
        </form>

        {people.length === 0 ? (
          <div className="ov-empty">
            {mode === 'doc' ? 'No hay ninguna persona con ese documento en el expediente.' : mode === 'text' ? 'Sin resultados para esa búsqueda. Prueba con menos palabras o con el documento completo.' : 'Aún no hay clientes registrados. Se crean al registrar un caso o convertir un lead.'}
          </div>
        ) : (
          <div className="ov-tablewrap">
            <table className="ov-table">
              <thead><tr><th>Cliente</th><th>Documento</th><th>Contacto</th><th>Último caso</th><th className="num">Casos</th><th className="num">Créditos</th><th className="num">Solicitudes</th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/empresa/clientes/${p.id}`}><strong>{p.firstName} {p.lastName}</strong></Link><small>Desde {fecha(p.createdAt)}{p.userId ? ' · con cuenta' : ''}</small></td>
                    <td>{p.documentType} ···{p.documentLast4}</td>
                    <td>{p.email ?? '—'}<small>{p.city ?? ''}</small></td>
                    <td>{p.opportunities[0] ? <>{p.opportunities[0].code}<small>{STAGE_LABELS[p.opportunities[0].stage]}</small></> : '—'}</td>
                    <td className="num">{p._count.opportunities}</td>
                    <td className="num">{p._count.loans}</td>
                    <td className="num">{p._count.requests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(p) => `/empresa/clientes${qs(base, { p })}`} />
      </article>
    </>
  );
}
