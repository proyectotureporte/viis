import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import { PageHeader, Status } from '@/components/ov/ui';
import { Pager } from '@/components/empresa/ui';
import { qs, spEnum, spPage, spUuid, type SearchParams } from '@/lib/empresa/params';
import { DOC_STATUS, fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import { temporaryDocumentUrl } from '@/lib/storage';
import { ReviewForms } from './ReviewForms';

export const metadata: Metadata = { title: 'Revisión documental' };

const PAGE_SIZE = 20;

function size(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function waited(date: Date, now: number): string {
  const hours = Math.floor((now - date.getTime()) / 3_600_000);
  return hours >= 48 ? `hace ${Math.floor(hours / 24)} d` : hours >= 1 ? `hace ${hours} h` : 'hace menos de 1 h';
}

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'doc.review' });
  const params = await searchParams;
  const status = spEnum(params, 'estado', ['UPLOADED', 'IN_REVIEW'] as const);
  const typeId = spUuid(params, 'tipo');
  const mine = params.mios === '1';
  const page = spPage(params);
  const prisma = getPrisma();

  const where: Prisma.DocumentWhereInput = {
    status: status ? status : { in: ['UPLOADED', 'IN_REVIEW'] },
    payment: { is: null },
    ...(typeId ? { typeId } : {}),
    ...(mine ? { reviewedById: session.user.id, status: 'IN_REVIEW' } : {}),
  };
  const [total, docs, types, quarantined, quarantinedCount, byStatus] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        type: { select: { name: true, validityDays: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, code: true } },
      },
    }),
    prisma.documentType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.document.findMany({
      where: { status: 'QUARANTINED' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: { type: { select: { name: true } }, person: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.document.count({ where: { status: 'QUARANTINED' } }),
    prisma.document.groupBy({ by: ['status'], where: { status: { in: ['UPLOADED', 'IN_REVIEW'] }, payment: { is: null } }, _count: { _all: true } }),
  ]);
  const reviewerIds = [...new Set(docs.map((d) => d.reviewedById).filter((v): v is string => Boolean(v)))];
  const reviewers = reviewerIds.length ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } }) : [];
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const now = new Date().getTime();
  const base = { estado: status, tipo: typeId, mios: mine ? '1' : '' };

  return (
    <>
      <PageHeader title="Revisión documental" subtitle="Los documentos más antiguos primero. Aprobar fija la vigencia según el tipo; rechazar exige un motivo que recibe el cliente." />
      <div className="ov-grid">
        <article className="ov-card s4"><div className="ov-eyebrow">Por revisar</div><div className="ov-big">{count('UPLOADED')}</div></article>
        <article className="ov-card s4"><div className="ov-eyebrow">En revisión</div><div className="ov-big">{count('IN_REVIEW')}</div></article>
        <article className="ov-card s4"><div className="ov-eyebrow">En verificación antivirus</div><div className="ov-big">{quarantinedCount}</div></article>
      </div>
      <article className="ov-card" style={{ marginTop: 16 }}>
        <form method="get" className="ov-filters">
          <label className="ov-field"><span>Estado</span>
            <select name="estado" defaultValue={status}>
              <option value="">Pendientes (todos)</option>
              <option value="UPLOADED">Cargados</option>
              <option value="IN_REVIEW">En revisión</option>
            </select>
          </label>
          <label className="ov-field"><span>Tipo</span>
            <select name="tipo" defaultValue={typeId}>
              <option value="">Todos</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="ov-check" style={{ alignSelf: 'center' }}><input type="checkbox" name="mios" value="1" defaultChecked={mine} /><span>Solo los que tengo yo</span></label>
          <button className="ov-btn ov-btn--secondary" type="submit">Filtrar</button>
        </form>
        {docs.length === 0 ? (
          <div className="ov-empty">No hay documentos pendientes con estos filtros. ¡Cola al día!</div>
        ) : (
          <div className="ov-tablewrap">
            <table className="ov-table">
              <thead><tr><th>Documento</th><th>Cliente y caso</th><th>Archivo</th><th>Estado</th><th>Revisión</th></tr></thead>
              <tbody>
                {docs.map((d) => {
                  const reviewer = reviewers.find((r) => r.id === d.reviewedById);
                  return (
                    <tr key={d.id}>
                      <td><strong>{d.type.name}</strong><small>Versión {d.version} · cargado {fechaHora(d.createdAt)} ({waited(d.createdAt, now)})</small></td>
                      <td>
                        <Link href={`/empresa/clientes/${d.person.id}`}>{d.person.firstName} {d.person.lastName}</Link>
                        <small>{d.opportunity ? <Link href={`/empresa/casos/${d.opportunity.id}`}>{d.opportunity.code}</Link> : 'Sin caso asociado'}</small>
                      </td>
                      <td>
                        <a href={temporaryDocumentUrl(d.id, session.user.id)} target="_blank" rel="noopener noreferrer">Ver archivo</a>
                        <small>{d.fileName} · {size(d.sizeBytes)} · antivirus: {d.scanResult === 'CLEAN' ? 'limpio' : d.scanResult}</small>
                      </td>
                      <td>
                        <Status tone={DOC_STATUS[d.status]?.tone}>{DOC_STATUS[d.status]?.label}</Status>
                        {d.status === 'IN_REVIEW' && <small>{reviewer ? (reviewer.id === session.user.id ? 'Lo tienes tú' : `Lo tiene ${reviewer.name}`) : ''}</small>}
                      </td>
                      <td style={{ minWidth: 230 }}>
                        <ReviewForms documentId={d.id} status={d.status} reviewerIsMe={d.reviewedById === session.user.id} validityDays={d.type.validityDays} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(p) => `/empresa/documentos${qs(base, { p })}`} />
      </article>

      <article className="ov-card" style={{ marginTop: 16 }}>
        <h2>En verificación antivirus</h2>
        <p className="ov-meta">Informativo: el antivirus no respondió al cargarlos. El sistema los reescanea automáticamente y nadie puede abrirlos hasta que queden limpios.</p>
        {quarantined.length === 0 ? <div className="ov-empty">No hay documentos en cuarentena.</div> : (
          <div className="ov-list">
            {quarantined.map((d) => (
              <div className="ov-row" key={d.id}>
                <span className="ov-dot ov-dot--gray" />
                <div className="grow">
                  <strong>{d.type.name} · <Link href={`/empresa/clientes/${d.person.id}`}>{d.person.firstName} {d.person.lastName}</Link></strong>
                  <small>Cargado {fechaHora(d.createdAt)} · resultado {d.scanResult}</small>
                </div>
              </div>
            ))}
            {quarantinedCount > quarantined.length && <p className="ov-meta">Y {quarantinedCount - quarantined.length} más.</p>}
          </div>
        )}
      </article>
    </>
  );
}
