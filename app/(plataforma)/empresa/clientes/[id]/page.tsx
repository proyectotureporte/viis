import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Confidence, Notice, PageHeader, Status } from '@/components/ov/ui';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { spUuid } from '@/lib/empresa/params';
import {
  DOC_STATUS, fecha, fechaDia, fechaHora, money, pct, PRIORITY_LABELS, PRODUCTS, REQUEST_KINDS, REQUEST_STATUS, slaText, STAGE_LABELS, toNumber,
} from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { can, caseScope } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { temporaryDocumentUrl } from '@/lib/storage';
import { revealDocumentAction, revokeConsentAction } from './actions';

export const metadata: Metadata = { title: 'Ficha del cliente' };

const REVOKE_CHANNELS: Record<string, string> = {
  ESCRITO: 'Comunicación escrita',
  CORREO: 'Correo electrónico',
  TELEFONICO: 'Llamada telefónica',
  PRESENCIAL: 'Presencial',
  SOLICITUD_PLATAFORMA: 'Solicitud en la plataforma',
};

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'person.read' });
  const id = spUuid(await params, 'id');
  if (!id) notFound();
  const prisma = getPrisma();
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, active: true, lastLoginAt: true } },
      consents: { orderBy: { grantedAt: 'desc' } },
      properties: { include: { valuations: { orderBy: { asOf: 'desc' }, take: 1 } }, orderBy: { createdAt: 'asc' } },
      loans: { include: { entity: { select: { name: true } } }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] },
      documents: { include: { type: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }], take: 60 },
      requests: { orderBy: { createdAt: 'desc' }, take: 30 },
      opportunities: {
        where: caseScope(session.user),
        orderBy: { createdAt: 'desc' },
        include: { entity: { select: { name: true } }, assignee: { select: { name: true } }, allyOrg: { select: { name: true } } },
      },
    },
  });
  if (!person) notFound();

  const userIds = [...new Set(person.consents.flatMap((c) => [c.capturedBy, c.revokedBy]).filter((v): v is string => Boolean(v)))];
  const people = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const nameOf = (uid: string | null) => (uid ? people.find((u) => u.id === uid)?.name ?? 'Usuario' : '—');
  const canConsent = can(session.user.role, 'consent.manage');
  const now = new Date().getTime();
  const activeConsents = person.consents.filter((c) => !c.revokedAt);

  return (
    <>
      <PageHeader
        title={`${person.firstName} ${person.lastName}`}
        subtitle={`${person.documentType} ···${person.documentLast4} · ${person.city ?? 'Ciudad sin registrar'} · en el expediente desde ${fecha(person.createdAt)}`}
        actions={<Link className="ov-btn ov-btn--secondary" href="/empresa/clientes">Volver a clientes</Link>}
      />
      {!activeConsents.some((c) => c.purpose === 'TRATAMIENTO') && (
        <Notice tone="danger">Este cliente no tiene autorización vigente de tratamiento de datos. No lo contactes ni gestiones su caso hasta resolverlo con cumplimiento.</Notice>
      )}
      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s6">
          <h2>Datos del cliente</h2>
          <dl className="ov-dl">
            <dt>Documento</dt><dd>{person.documentType} ···{person.documentLast4}</dd>
            <dt>Correo</dt><dd>{person.email ?? '—'}</dd>
            <dt>Teléfono</dt><dd>{person.phoneEnc ? 'Registrado (protegido)' : '—'}</dd>
            <dt>Cuenta en OpenV</dt><dd>{person.user ? `${person.user.active ? 'Activa' : 'Inactiva'} · último ingreso ${fechaHora(person.user.lastLoginAt)}` : 'Sin cuenta de cliente'}</dd>
            <dt>Protección de aliado</dt><dd>{person.ownerUntil && person.ownerUntil.getTime() > now ? `Hasta ${fecha(person.ownerUntil)}` : 'No'}</dd>
          </dl>
          <ActionForm action={revealDocumentAction} className="ov-form" >
            <input type="hidden" name="personId" value={person.id} />
            <div><SubmitButton className="ov-btn ov-btn--secondary ov-btn--small" pendingText="Consultando…">Ver documento y teléfono completos</SubmitButton></div>
            <small className="ov-meta">La consulta queda registrada en la bitácora con tu usuario.</small>
          </ActionForm>
        </article>
        <article className="ov-card s6">
          <h2>Hogar e ingresos</h2>
          <div className="ove-kv">
            <div><small>Ingreso mensual</small><strong>{person.monthlyIncome !== null ? money(person.monthlyIncome) : '—'}</strong></div>
            <div><small>Gastos mensuales</small><strong>{person.monthlyExpenses !== null ? money(person.monthlyExpenses) : '—'}</strong></div>
            <div><small>Ahorros</small><strong>{person.savings !== null ? money(person.savings) : '—'}</strong></div>
          </div>
          <p className="ov-meta" style={{ marginTop: 8 }}><Confidence level="DECLARED" source="Declarado por el cliente o el asesor" /></p>
          {person.goals && <p style={{ marginBottom: 0 }}><strong>Objetivos:</strong> {person.goals}</p>}
        </article>

        <article className="ov-card s12">
          <header><h2>Casos</h2>{can(session.user.role, 'case.create') && <Link className="ov-btn ov-btn--small" href="/empresa/casos/nuevo">+ Nuevo caso</Link>}</header>
          {person.opportunities.length === 0 ? (
            <div className="ov-empty">No hay casos de este cliente dentro de tu alcance.</div>
          ) : (
            <div className="ov-tablewrap">
              <table className="ov-table">
                <thead><tr><th>Caso</th><th>Producto</th><th>Etapa</th><th>Prioridad</th><th>Responsable</th><th>Entidad</th><th>Canal</th><th className="num">Monto</th></tr></thead>
                <tbody>
                  {person.opportunities.map((o) => {
                    const sla = slaText(o.slaDueAt, now);
                    return (
                      <tr key={o.id}>
                        <td><Link href={`/empresa/casos/${o.id}`}><strong>{o.code}</strong></Link><small>{fecha(o.createdAt)}</small></td>
                        <td>{PRODUCTS[o.product] ?? o.product}</td>
                        <td>{STAGE_LABELS[o.stage]}<small><Status tone={sla.tone}>{sla.text}</Status></small></td>
                        <td><Status tone={PRIORITY_LABELS[o.priority].tone}>{PRIORITY_LABELS[o.priority].label}</Status></td>
                        <td>{o.assignee?.name ?? 'Sin asignar'}</td>
                        <td>{o.entity?.name ?? '—'}</td>
                        <td>{o.channel}{o.allyOrg ? <small>{o.allyOrg.name}</small> : null}</td>
                        <td className="num">{o.disbursedAmount ? money(o.disbursedAmount) : o.amount ? money(o.amount) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="ov-card s6">
          <h2>Créditos</h2>
          {person.loans.length === 0 ? <div className="ov-empty">Sin créditos registrados.</div> : (
            <div className="ov-list">
              {person.loans.map((l) => (
                <div className="ov-row" key={l.id}>
                  <span className={l.active ? 'ov-dot' : 'ov-dot ov-dot--gray'} />
                  <div className="grow">
                    <strong>{l.alias} · {l.entity?.name ?? 'Entidad sin registrar'}</strong>
                    <small>Saldo {money(l.balance)} al {fechaDia(l.balanceAsOf)} · {pct(Number(l.rateEa))} EA · {l.system === 'UVR' ? 'UVR' : 'Pesos'} · cuota {l.paidInstallments}/{l.termMonths}</small>
                    <Confidence level={l.confidence} source={l.source} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="ov-card s6">
          <h2>Inmuebles</h2>
          {person.properties.length === 0 ? <div className="ov-empty">Sin inmuebles registrados.</div> : (
            <div className="ov-list">
              {person.properties.map((p) => {
                const v = p.valuations[0];
                return (
                  <div className="ov-row" key={p.id}>
                    <div className="grow">
                      <strong>{p.alias}{p.city ? ` · ${p.city}` : ''}</strong>
                      <small>{p.kind}{p.stratum ? ` · estrato ${p.stratum}` : ''}{p.areaM2 ? ` · ${toNumber(p.areaM2)} m²` : ''}{p.isVis ? ' · VIS' : ''}</small>
                      {v ? <><small>Valor {money(v.value)}{v.low && v.high ? ` (rango ${money(v.low, true)}–${money(v.high, true)})` : ''}</small><Confidence level={v.confidence} source={v.source} asOf={fechaDia(v.asOf)} /></> : <small>Sin valoración</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="ov-card s12">
          <h2>Documentos</h2>
          {person.documents.length === 0 ? <div className="ov-empty">El cliente aún no tiene documentos cargados.</div> : (
            <div className="ov-tablewrap">
              <table className="ov-table">
                <thead><tr><th>Tipo</th><th>Versión</th><th>Estado</th><th>Cargado</th><th>Vence</th><th>Archivo</th></tr></thead>
                <tbody>
                  {person.documents.map((d) => (
                    <tr key={d.id}>
                      <td>{d.type.name}{d.rejectReason && <small>Motivo: {d.rejectReason}</small>}</td>
                      <td>v{d.version}</td>
                      <td><Status tone={DOC_STATUS[d.status]?.tone}>{DOC_STATUS[d.status]?.label ?? d.status}</Status></td>
                      <td>{fechaHora(d.createdAt)}</td>
                      <td>{fechaDia(d.expiresAt)}</td>
                      <td>{d.status === 'QUARANTINED' ? <span className="ov-meta">No disponible</span> : <a href={temporaryDocumentUrl(d.id, session.user.id)} target="_blank" rel="noopener noreferrer">Ver (enlace de 5 min)</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="ov-card s12">
          <h2>Solicitudes</h2>
          {person.requests.length === 0 ? <div className="ov-empty">Sin solicitudes.</div> : (
            <div className="ov-list">
              {person.requests.map((r) => (
                <div className="ov-row" key={r.id}>
                  <div className="grow">
                    <strong>{can(session.user.role, 'request.manage') ? <Link href={`/empresa/solicitudes/${r.id}`}>{r.code}</Link> : r.code} · {r.subject}</strong>
                    <small>{REQUEST_KINDS[r.kind]?.label ?? r.kind} · creada {fechaHora(r.createdAt)} · SLA {fechaHora(r.slaDueAt)}</small>
                  </div>
                  <Status tone={REQUEST_STATUS[r.status]?.tone}>{REQUEST_STATUS[r.status]?.label ?? r.status}</Status>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="ov-card s12">
          <h2>Autorizaciones</h2>
          <div className="ov-list">
            {CONSENT_PURPOSES.map((purpose) => {
              const active = activeConsents.find((c) => c.purpose === purpose.code);
              return (
                <div className="ov-row" key={purpose.code} style={{ flexWrap: 'wrap' }}>
                  <span className={active ? 'ov-dot' : 'ov-dot ov-dot--gray'} />
                  <div className="grow">
                    <strong>{purpose.title}{purpose.required ? ' (obligatoria)' : ''}</strong>
                    <small>{active ? `Vigente desde ${fechaHora(active.grantedAt)} · versión ${active.textVersion} · canal ${active.channel} · registrada por ${active.capturedBy ? nameOf(active.capturedBy) : 'el cliente'}` : 'No vigente'}</small>
                  </div>
                  {active && canConsent && (
                    <details className="ove-details" style={{ flexBasis: '100%' }}>
                      <summary>Registrar revocación</summary>
                      {purpose.code === 'TRATAMIENTO' && <Notice tone="danger">Revocar el tratamiento impide seguir gestionando al cliente. Verifica que no exista un deber legal de conservación.</Notice>}
                      <ActionForm action={revokeConsentAction} className="ov-form ov-form--2">
                        <input type="hidden" name="personId" value={person.id} />
                        <input type="hidden" name="purpose" value={purpose.code} />
                        <label className="ov-field"><span>Canal de la revocación</span>
                          <select name="channel" required defaultValue="">
                            <option value="" disabled>Elige…</option>
                            {Object.entries(REVOKE_CHANNELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                          </select>
                        </label>
                        <label className="ov-field full"><span>Evidencia (obligatoria)</span><textarea name="evidence" required minLength={10} maxLength={1000} placeholder="Ej.: correo del 12-sep-2026 desde el correo registrado, radicado PQR SOL-1044…" /></label>
                        <div className="full"><SubmitButton className="ov-btn ov-btn--danger" confirm="¿Registrar la revocación de esta autorización?">Registrar revocación</SubmitButton></div>
                      </ActionForm>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <details className="ove-details" style={{ marginTop: 12 }}>
            <summary>Historial completo ({person.consents.length})</summary>
            <div className="ov-tablewrap">
              <table className="ov-table">
                <thead><tr><th>Finalidad</th><th>Versión</th><th>Canal</th><th>Otorgada</th><th>Registrada por</th><th>Revocada</th></tr></thead>
                <tbody>
                  {person.consents.map((c) => (
                    <tr key={c.id}>
                      <td>{CONSENT_PURPOSES.find((p) => p.code === c.purpose)?.title ?? c.purpose}<small className="ov-mono">hash {c.textHash.slice(0, 12)}…</small></td>
                      <td>{c.textVersion}</td>
                      <td>{c.channel}</td>
                      <td>{fechaHora(c.grantedAt)}</td>
                      <td>{c.capturedBy ? nameOf(c.capturedBy) : 'El cliente'}</td>
                      <td>{c.revokedAt ? <>{fechaHora(c.revokedAt)}<small>por {nameOf(c.revokedBy)}</small></> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>
      </div>
    </>
  );
}
