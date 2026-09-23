import type { Metadata } from 'next';
import Link from 'next/link';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { NoPerson } from '@/components/cliente/ui';
import { Empty, Notice, PageHeader, Section, Status } from '@/components/ov/ui';
import { checklist } from '@/lib/domain/documents';
import { todayBogota } from '@/lib/cliente/format';
import { clientPage } from '@/lib/cliente/page';
import { DOC_STATUS, fechaDia, PRODUCTS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { uploadDocumentAction } from './actions';

export const metadata: Metadata = { title: 'Documentos' };

const ACCEPT = '.pdf,.jpg,.jpeg,.png';

function UploadForm({ typeId, opportunityId, label }: { typeId: string; opportunityId?: string; label: string }) {
  return (
    <KeepForm action={uploadDocumentAction} className="ov-form ov-inline" resetOnSuccess>
      <input type="hidden" name="typeId" value={typeId} />
      {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}
      <label className="ov-field">
        <span>{label}</span>
        <input type="file" name="file" accept={ACCEPT} required />
        <small>PDF, JPG o PNG · máximo 10 MB</small>
      </label>
      <Submit className="ov-btn ov-btn--small" pendingText="Subiendo…">Subir</Submit>
    </KeepForm>
  );
}

function ViewLink({ id, status, scan }: { id: string; status: string; scan: string }) {
  if (status === 'QUARANTINED' || scan !== 'CLEAN') return <span className="ov-meta">En verificación</span>;
  return (
    <a className="ov-btn ov-btn--secondary ov-btn--small" href={`/cliente/documentos/ver/${id}`} target="_blank" rel="noopener">
      Ver<span className="cl-sr"> (se abre en otra pestaña)</span>
    </a>
  );
}

export default async function DocumentosPage() {
  const { person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Documentos" />
        <NoPerson />
      </>
    );
  }
  const prisma = getPrisma();
  const [cases, types, documents] = await Promise.all([
    prisma.opportunity.findMany({ where: { personId: person.id, stage: { notIn: ['WITHDRAWN', 'DISBURSED', 'POSTSALE'] } }, orderBy: { createdAt: 'desc' } }),
    prisma.documentType.findMany({ where: { active: true, code: { not: 'SOPORTE_PAGO' } }, orderBy: { sortOrder: 'asc' } }),
    prisma.document.findMany({ where: { personId: person.id }, include: { type: true, opportunity: { select: { code: true } } }, orderBy: [{ typeId: 'asc' }, { version: 'desc' }] }),
  ]);
  const lists = await Promise.all(cases.map(async (c) => ({ case: c, items: await checklist(prisma, person.id, c.product) })));
  const nowMs = new Date(`${todayBogota()}T00:00:00Z`).getTime();
  const soon = nowMs + 30 * 86_400_000;

  const byType = new Map<string, typeof documents>();
  for (const d of documents) byType.set(d.typeId, [...(byType.get(d.typeId) ?? []), d]);

  return (
    <>
      <PageHeader title="Documentos" subtitle="Lo que falta, lo que está en revisión y todo tu expediente en un solo lugar." />
      <Notice tone="info">
        Tus archivos se guardan cifrados y pasan por antivirus. Solo tú y el equipo que gestiona tu caso pueden verlos, y cada apertura queda registrada con marca de agua.
      </Notice>

      {lists.length === 0 ? (
        <>
          <Section title="Checklist de tus casos" />
          <Empty>No tienes casos en trámite, así que no hay documentos pendientes. Puedes cargar documentos a tu expediente abajo.</Empty>
        </>
      ) : (
        lists.map(({ case: c, items }) => {
          const pending = items.filter((i) => i.type.required && (!i.latest || ['REJECTED', 'EXPIRED'].includes(i.latest.status) || (i.latest.expiresAt && i.latest.expiresAt.getTime() < nowMs)));
          return (
            <div key={c.id}>
              <Section title={`${c.code} · ${PRODUCTS[c.product] ?? c.product}`}>
                <span className="ov-pill">{pending.length ? `${pending.length} pendiente(s)` : 'Completo por tu parte'}</span>
              </Section>
              <article className="ov-card">
                <div className="ov-list">
                  {items.map(({ type, latest }) => {
                    const expired = latest?.expiresAt && latest.expiresAt.getTime() < nowMs;
                    const expiring = latest?.expiresAt && !expired && latest.expiresAt.getTime() < soon;
                    const needsUpload = !latest || latest.status === 'REJECTED' || latest.status === 'EXPIRED' || expired;
                    return (
                      <div className="ov-row" key={type.id} style={{ flexWrap: 'wrap' }}>
                        <span className={latest?.status === 'APPROVED' && !expired ? 'ov-dot' : needsUpload && type.required ? 'ov-dot ov-dot--red' : 'ov-dot ov-dot--amber'} aria-hidden />
                        <div className="grow">
                          <strong>{type.name}{type.required ? '' : ' (opcional)'}</strong>
                          <small>{type.description}</small>
                          {latest && (
                            <small>
                              Versión {latest.version} · {latest.fileName} · cargado {fechaDia(latest.createdAt)}
                              {latest.expiresAt ? ` · ${expired ? 'venció' : 'vence'} ${fechaDia(latest.expiresAt)}` : ''}
                            </small>
                          )}
                          {latest?.status === 'REJECTED' && latest.rejectReason && <small className="ov-negative">Motivo del rechazo: {latest.rejectReason}</small>}
                          {expiring && <small className="ov-negative">Vence pronto: prepara una versión actualizada.</small>}
                        </div>
                        {latest ? <Status tone={expired ? 'bad' : DOC_STATUS[latest.status].tone}>{expired ? 'Vencido' : DOC_STATUS[latest.status].label}</Status> : <Status tone="gray">Pendiente</Status>}
                        {latest && <ViewLink id={latest.id} status={latest.status} scan={latest.scanResult} />}
                        {(needsUpload || expiring) && (
                          <div style={{ flexBasis: '100%' }}>
                            <UploadForm typeId={type.id} opportunityId={c.id} label={latest ? 'Cargar nueva versión' : 'Cargar documento'} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            </div>
          );
        })
      )}

      <Section title="Cargar a mi expediente" />
      <article className="ov-card" id="subir">
        <KeepForm action={uploadDocumentAction} className="ov-form ov-form--3" resetOnSuccess>
          <label className="ov-field">
            <span>Tipo de documento</span>
            <select name="typeId" required defaultValue="">
              <option value="" disabled>Elige</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="ov-field">
            <span>Caso (opcional)</span>
            <select name="opportunityId" defaultValue="">
              <option value="">Solo a mi expediente</option>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.code} · {PRODUCTS[c.product] ?? c.product}</option>)}
            </select>
          </label>
          <label className="ov-field">
            <span>Archivo</span>
            <input type="file" name="file" accept={ACCEPT} required />
            <small>PDF, JPG o PNG · máximo 10 MB</small>
          </label>
          <div className="full"><Submit pendingText="Subiendo…">Subir documento</Submit></div>
        </KeepForm>
        <p className="ov-meta" style={{ marginTop: 10 }}>¿Vas a reportar un pago? Hazlo desde <Link href="/cliente/gestiones#pago">Gestiones → Reportar pago</Link>.</p>
      </article>

      <Section title="Todo mi expediente" />
      <article className="ov-card">
        {byType.size === 0 ? (
          <Empty>Aún no has cargado documentos.</Empty>
        ) : (
          <div className="ov-list">
            {[...byType.values()].map((versions) => {
              const [last, ...older] = versions;
              return (
                <details className="ov-details ov-row" key={last.typeId} style={{ display: 'block' }}>
                  <summary>
                    {last.type.name} · v{last.version} · <Status tone={DOC_STATUS[last.status].tone}>{DOC_STATUS[last.status].label}</Status>
                  </summary>
                  <div className="ov-list">
                    {[last, ...older].map((d) => (
                      <div className="ov-row" key={d.id}>
                        <div className="grow">
                          <strong>Versión {d.version} · {d.fileName}</strong>
                          <small>
                            Cargado {fechaDia(d.createdAt)}{d.opportunity ? ` · caso ${d.opportunity.code}` : ''}{d.expiresAt ? ` · vence ${fechaDia(d.expiresAt)}` : ''}
                            {d.rejectReason ? ` · Motivo: ${d.rejectReason}` : ''}
                          </small>
                        </div>
                        <Status tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Status>
                        <ViewLink id={d.id} status={d.status} scan={d.scanResult} />
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </article>
    </>
  );
}
