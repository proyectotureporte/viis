import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Confidence, Empty, Notice, PageHeader, Status } from '@/components/ov/ui';
import { JsonBlock } from '@/components/empresa/ui';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { allowedTransitions } from '@/lib/domain/cases';
import { checklist } from '@/lib/domain/documents';
import { activeStaff } from '@/lib/empresa/access';
import type { OfferResults } from '@/lib/empresa/finance';
import { fullName, todayBogota } from '@/lib/empresa/params';
import {
  COMMISSION_STATUS, DOC_STATUS, DOCUMENT_TYPES_ID, fecha, fechaDia, fechaHora, money, PIPELINE_STAGES, pct, PRIORITY_LABELS, PRODUCTS, slaText, STAGE_LABELS, toNumber,
} from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { can, caseScope, ROLE_LABELS } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { temporaryDocumentUrl } from '@/lib/storage';
import {
  acceptOfferAction, addInteractionAction, assignAction, changeStageAction, createOfferAction, createTaskAction, decideDocAction, escalateAction,
  nextActionAction, revealPersonAction, setEntityAction, setPriorityAction, takeDocAction, updateTaskAction, uploadDocAction,
} from './actions';

export const metadata: Metadata = { title: 'Expediente del caso' };

const CHANNEL_LABELS: Record<string, string> = { LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp', CORREO: 'Correo', REUNION: 'Reunión', INTERNO: 'Nota interna' };
const TASK_KINDS: Record<string, string> = { TAREA: 'Tarea', LLAMADA: 'Llamada', CITA: 'Cita', SEGUIMIENTO: 'Seguimiento' };
const SYSTEM_LABELS: Record<string, string> = { FIXED_PESOS: 'Pesos, cuota fija', UVR: 'UVR' };

/** Hora actual del servidor al renderizar (componente de servidor, sin re-render en cliente). */
function currentTime(): number {
  return Date.now();
}

function rate(value: { toString(): string }): string {
  return pct(Number(value.toString()), 2);
}

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await requireUser({ portal: 'empresa', permission: 'case.read' });
  const role = session.user.role;
  const prisma = getPrisma();

  const opp = await prisma.opportunity.findFirst({
    where: { id, ...caseScope(session.user) },
    include: {
      person: {
        include: {
          user: { select: { id: true, email: true, active: true } },
          consents: { orderBy: { grantedAt: 'desc' } },
          properties: { include: { valuations: { orderBy: { asOf: 'desc' }, take: 1 } }, orderBy: { createdAt: 'asc' } },
          loans: { include: { entity: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
        },
      },
      entity: true,
      assignee: { select: { id: true, name: true } },
      allyOrg: { select: { id: true, name: true, tier: true } },
      allyUser: { select: { id: true, name: true, email: true } },
      stages: { orderBy: { createdAt: 'desc' } },
      tasks: { include: { assignee: { select: { name: true } } }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] },
      interactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      offers: { orderBy: { createdAt: 'asc' } },
      commissions: { include: { rule: { select: { name: true, version: true } } } },
    },
  });
  if (!opp) notFound();
  const person = opp.person;

  const [items, allDocs, entities, staff, docTypes] = await Promise.all([
    checklist(prisma as unknown as Parameters<typeof checklist>[0], person.id, opp.product),
    prisma.document.findMany({ where: { personId: person.id }, include: { type: { select: { name: true } } }, orderBy: [{ typeId: 'asc' }, { version: 'desc' }] }),
    prisma.entity.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    activeStaff(),
    prisma.documentType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  const relatedIds = [person.id, ...allDocs.map((d) => d.id), ...opp.offers.map((o) => o.id), ...opp.commissions.map((c) => c.id)];
  const events = await prisma.auditEvent.findMany({
    where: { OR: [{ entity: 'Opportunity', entityId: opp.id }, { entityId: { in: relatedIds } }] },
    orderBy: { id: 'desc' },
    take: 50,
  });
  const userIds = new Set<string>();
  for (const e of events) if (e.actorId) userIds.add(e.actorId);
  for (const s of opp.stages) if (s.byUserId) userIds.add(s.byUserId);
  for (const i of opp.interactions) if (i.byUserId) userIds.add(i.byUserId);
  for (const o of opp.offers) if (o.acceptedById) userIds.add(o.acceptedById);
  for (const d of allDocs) if (d.reviewedById) userIds.add(d.reviewedById);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const who = (uid: string | null | undefined) => (uid ? users.get(uid) ?? 'Usuario' : 'Sistema');

  const perm = {
    stage: can(role, 'case.stage'),
    assign: can(role, 'case.assign'),
    note: can(role, 'case.note'),
    review: can(role, 'doc.review'),
    upload: can(role, 'doc.upload'),
    offer: can(role, 'offer.manage'),
    person: can(role, 'person.read'),
  };
  const nowMs = currentTime();
  const sla = slaText(opp.slaDueAt);
  const closed = ['WITHDRAWN', 'POSTSALE', 'DISBURSED'].includes(opp.stage);
  const transitions = allowedTransitions(opp.stage);
  const stageIndex = PIPELINE_STAGES.indexOf(opp.stage);
  const today = todayBogota();
  const activeConsents = person.consents.filter((c) => !c.revokedAt);
  const revokedConsents = person.consents.filter((c) => c.revokedAt);
  const accepted = opp.offers.find((o) => o.acceptedAt);
  const offerRows = opp.offers.map((o) => ({ offer: o, r: o.results as unknown as OfferResults }));
  const minTotal = Math.min(...offerRows.map((x) => x.r.totalCost ?? Infinity));
  const minPayment = Math.min(...offerRows.map((x) => x.r.payment ?? Infinity));
  const hasPortfolio = offerRows.some((x) => x.r.portfolio);
  const docsByType = new Map<string, typeof allDocs>();
  for (const d of allDocs) docsByType.set(d.typeId, [...(docsByType.get(d.typeId) ?? []), d]);

  return (
    <>
      <PageHeader
        title={`${opp.code} · ${fullName(person)}`}
        subtitle={`${PRODUCTS[opp.product] ?? opp.product} · Canal ${opp.channel}${opp.allyOrg ? ` · ${opp.allyOrg.name}` : ''} · creado ${fecha(opp.createdAt)}`}
        actions={<Link className="ov-btn ov-btn--secondary" href="/empresa/bandeja">← Bandeja</Link>}
      />

      {opp.slaDueAt && sla.tone === 'bad' && !closed && <Notice tone="danger">SLA de la etapa {STAGE_LABELS[opp.stage]} vencido: {sla.text.toLowerCase()}.{opp.escalatedAt ? ` Escalado el ${fechaHora(opp.escalatedAt)}.` : ''}</Notice>}
      {opp.escalatedAt && sla.tone !== 'bad' && <Notice>Caso escalado el {fechaHora(opp.escalatedAt)}.</Notice>}

      <div className="ov-grid" style={{ marginTop: 16 }}>
        {/* ── Resumen ─────────────────────────────────── */}
        <article className="ov-card s12">
          <div className="ove-kv">
            <div><small>Etapa</small><strong>{STAGE_LABELS[opp.stage]}</strong></div>
            <div><small>Prioridad</small><strong><Status tone={PRIORITY_LABELS[opp.priority].tone}>{PRIORITY_LABELS[opp.priority].label}</Status></strong></div>
            <div><small>SLA de la etapa</small><strong><Status tone={sla.tone}>{sla.text}</Status></strong></div>
            <div><small>Responsable</small><strong>{opp.assignee?.name ?? 'Sin asignar'}</strong></div>
            <div><small>Entidad</small><strong>{opp.entity?.name ?? 'Sin asignar'}</strong></div>
            <div><small>Monto solicitado</small><strong>{opp.amount ? money(opp.amount) : '—'}</strong></div>
            {opp.disbursedAmount && <div><small>Desembolsado</small><strong>{money(opp.disbursedAmount)}</strong></div>}
            <div><small>Aliado</small><strong>{opp.allyUser ? `${opp.allyUser.name}` : opp.allyOrg?.name ?? 'Directo'}</strong></div>
            <div><small>Siguiente acción</small><strong>{opp.nextAction ?? '—'}</strong></div>
          </div>
          {opp.withdrawReason && opp.stage === 'WITHDRAWN' && <p className="ov-meta" style={{ marginTop: 10 }}>Causa del desistimiento: {opp.withdrawReason}</p>}
        </article>

        {/* ── Etapa ───────────────────────────────────── */}
        <article className="ov-card s8">
          <h2>Etapa y línea de tiempo</h2>
          <div className="ov-steps" aria-label="Avance del caso">
            {PIPELINE_STAGES.map((s, i) => (
              <span key={s} className={s === opp.stage ? 'now' : stageIndex >= 0 && i < stageIndex ? 'done' : ''}>{STAGE_LABELS[s]}</span>
            ))}
            {(opp.stage === 'WITHDRAWN' || opp.stage === 'POSTSALE') && <span className="now">{STAGE_LABELS[opp.stage]}</span>}
          </div>
          {perm.stage && transitions.length > 0 && (
            <details className="ove-details" style={{ margin: '12px 0' }}>
              <summary>Cambiar etapa</summary>
              <ActionForm action={changeStageAction} className="ov-form ov-form--2">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field">
                  <span>Pasar a</span>
                  <select name="to" required defaultValue="">
                    <option value="" disabled>Elige…</option>
                    {transitions.map((t) => <option key={t} value={t}>{STAGE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label className="ov-field"><span>Nota (opcional)</span><input name="note" maxLength={500} /></label>
                {transitions.includes('DISBURSED') && (
                  <label className="ov-field"><span>Monto desembolsado (solo si pasa a Desembolsado)</span><input name="disbursedAmount" inputMode="numeric" placeholder="Ej. 180.000.000" /></label>
                )}
                {transitions.includes('WITHDRAWN') && (
                  <label className="ov-field"><span>Causa del desistimiento (obligatoria si pasa a Desistido)</span><input name="withdrawReason" maxLength={240} placeholder="Ej. Consiguió mejor tasa con su banco" /></label>
                )}
                <p className="ov-meta full">Para radicar se exige autorización de compartir con entidades, entidad asignada y documentos requeridos aprobados.</p>
                <div className="full"><SubmitButton>Cambiar etapa</SubmitButton></div>
              </ActionForm>
            </details>
          )}
          {opp.stages.length ? (
            <ol className="ov-timeline">
              {opp.stages.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.from ? `${STAGE_LABELS[s.from]} → ` : ''}{STAGE_LABELS[s.to]}</strong>
                    <small className="ov-meta" style={{ display: 'block' }}>{fechaHora(s.createdAt)} · {who(s.byUserId)}{s.note ? ` · ${s.note}` : ''}</small>
                  </div>
                </li>
              ))}
            </ol>
          ) : <Empty>Sin cambios de etapa registrados.</Empty>}
        </article>

        {/* ── Gestión ─────────────────────────────────── */}
        <article className="ov-card s4">
          <h2>Gestión del caso</h2>
          <div className="ove-stack-list">
            {perm.assign && (
              <>
                <ActionForm action={assignAction} className="ove-inline-form">
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <label className="ov-field" style={{ flex: 1 }}>
                    <span>Responsable</span>
                    <select name="assigneeId" defaultValue={opp.assigneeId ?? ''}>
                      <option value="">Sin asignar</option>
                      {staff.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABELS[u.role]}</option>)}
                    </select>
                  </label>
                  <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Asignar</SubmitButton>
                </ActionForm>
                <ActionForm action={setPriorityAction} className="ove-inline-form">
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <label className="ov-field" style={{ flex: 1 }}>
                    <span>Prioridad</span>
                    <select name="priority" defaultValue={opp.priority}>
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                  <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Guardar</SubmitButton>
                </ActionForm>
              </>
            )}
            {perm.stage && (
              <ActionForm action={setEntityAction} className="ove-inline-form">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field" style={{ flex: 1 }}>
                  <span>Entidad financiera</span>
                  <select name="entityId" defaultValue={opp.entityId ?? ''}>
                    <option value="">Sin asignar</option>
                    {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Guardar</SubmitButton>
              </ActionForm>
            )}
            {perm.note && (
              <ActionForm action={nextActionAction} className="ove-inline-form">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field" style={{ flex: 1 }}>
                  <span>Siguiente acción</span>
                  <input name="nextAction" defaultValue={opp.nextAction ?? ''} maxLength={240} required />
                </label>
                <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Guardar</SubmitButton>
              </ActionForm>
            )}
            {perm.stage && !['WITHDRAWN', 'POSTSALE'].includes(opp.stage) && (
              <details className="ove-details">
                <summary>Escalar caso</summary>
                <ActionForm action={escalateAction}>
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <label className="ov-field"><span>Motivo (obligatorio)</span><textarea name="reason" required minLength={5} maxLength={300} /></label>
                  <SubmitButton className="ov-btn ov-btn--danger">Escalar a coordinación</SubmitButton>
                </ActionForm>
              </details>
            )}
            {opp.allyUser && <p className="ov-meta">Aliado: {opp.allyUser.name} · {opp.allyUser.email}{opp.allyOrg ? ` · ${opp.allyOrg.name} (${opp.allyOrg.tier})` : ''}</p>}
          </div>
        </article>

        {/* ── Cliente ─────────────────────────────────── */}
        <article className="ov-card s6">
          <h2>Cliente</h2>
          <dl className="ov-dl">
            <dt>Nombre</dt><dd>{fullName(person)}</dd>
            <dt>Documento</dt><dd>{DOCUMENT_TYPES_ID[person.documentType] ?? person.documentType} ···{person.documentLast4}</dd>
            <dt>Correo</dt><dd>{person.email ?? '—'}</dd>
            <dt>Teléfono</dt><dd>{person.phoneEnc ? 'Registrado (protegido)' : '—'}</dd>
            <dt>Ciudad</dt><dd>{person.city ?? '—'}</dd>
            <dt>Cuenta en OpenV</dt><dd>{person.user ? (person.user.active ? 'Activa' : 'Inactiva') : 'Sin cuenta de cliente'}</dd>
            {person.ownerAllyOrgId && person.ownerUntil && <><dt>Titularidad aliado</dt><dd>Protegido hasta {fecha(person.ownerUntil)}</dd></>}
          </dl>
          {perm.person && (
            <ActionForm action={revealPersonAction} className="ov-form" >
              <input type="hidden" name="opportunityId" value={opp.id} />
              <div className="ov-actions" style={{ marginTop: 12 }}>
                <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small" pendingText="Consultando…">Ver documento y teléfono completos</SubmitButton>
                <span className="ov-meta">Cada consulta queda en la bitácora.</span>
              </div>
            </ActionForm>
          )}
          {can(role, 'person.read') && <p style={{ marginTop: 10 }}><Link href={`/empresa/clientes/${person.id}`}>Abrir ficha completa del cliente →</Link></p>}
        </article>

        <article className="ov-card s6">
          <h2>Hogar e ingresos</h2>
          <dl className="ov-dl">
            <dt>Ingreso mensual</dt><dd>{person.monthlyIncome !== null ? <>{money(person.monthlyIncome)} <Confidence level="DECLARED" /></> : 'No informado'}</dd>
            <dt>Gastos mensuales</dt><dd>{person.monthlyExpenses !== null ? <>{money(person.monthlyExpenses)} <Confidence level="DECLARED" /></> : 'No informado'}</dd>
            <dt>Ahorros</dt><dd>{person.savings !== null ? <>{money(person.savings)} <Confidence level="DECLARED" /></> : 'No informado'}</dd>
            <dt>Margen mensual</dt><dd>{person.monthlyIncome !== null && person.monthlyExpenses !== null ? money(toNumber(person.monthlyIncome) - toNumber(person.monthlyExpenses)) : '—'}</dd>
            <dt>Objetivos</dt><dd>{person.goals ?? '—'}</dd>
          </dl>
        </article>

        <article className="ov-card s6">
          <h2>Inmuebles</h2>
          {person.properties.length ? (
            <div className="ov-list">
              {person.properties.map((p) => {
                const v = p.valuations[0];
                return (
                  <div className="ov-row" key={p.id}>
                    <div className="grow">
                      <strong>{p.alias} · {p.kind.toLowerCase()}{p.isVis ? ' · VIS' : ''}</strong>
                      <small>{[p.address, p.city, p.stratum ? `estrato ${p.stratum}` : null, p.areaM2 ? `${p.areaM2.toString()} m²` : null].filter(Boolean).join(' · ') || 'Sin dirección'}</small>
                      {v ? (
                        <small>Valor {money(v.value)}{v.low && v.high ? ` (rango ${money(v.low, true)} – ${money(v.high, true)})` : ''} <Confidence level={v.confidence} source={v.source} asOf={fechaDia(v.asOf)} /></small>
                      ) : <small>Sin valoración registrada.</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty>El cliente no tiene inmuebles registrados.</Empty>}
        </article>

        <article className="ov-card s6">
          <h2>Créditos</h2>
          {person.loans.length ? (
            <div className="ov-list">
              {person.loans.map((l) => (
                <div className="ov-row" key={l.id}>
                  <span className={l.active ? 'ov-dot' : 'ov-dot ov-dot--gray'} />
                  <div className="grow">
                    <strong>{l.alias}{l.entity ? ` · ${l.entity.name}` : ''}{l.active ? '' : ' · inactivo'}</strong>
                    <small>Saldo {money(l.balance)} al {fechaDia(l.balanceAsOf)} · tasa {rate(l.rateEa)} EA · {SYSTEM_LABELS[l.system]}</small>
                    <small>Plazo {l.termMonths} meses · {l.paidInstallments} cuotas pagadas · desembolso {fechaDia(l.disbursedAt)} por {money(l.originalAmount)}</small>
                    <small><Confidence level={l.confidence} source={l.source} /></small>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty>Sin créditos registrados.</Empty>}
        </article>

        {/* ── Consentimientos ─────────────────────────── */}
        <article className="ov-card s12">
          <h2>Consentimientos</h2>
          <div className="ov-tablewrap">
            <table className="ov-table">
              <thead><tr><th>Finalidad</th><th>Estado</th><th>Versión del texto</th><th>Otorgado</th><th>Canal</th></tr></thead>
              <tbody>
                {CONSENT_PURPOSES.map((purpose) => {
                  const c = activeConsents.find((x) => x.purpose === purpose.code);
                  return (
                    <tr key={purpose.code}>
                      <td>{purpose.title}{purpose.required ? <small>Obligatorio</small> : null}</td>
                      <td>{c ? <Status>Vigente</Status> : <Status tone="gray">No otorgado</Status>}</td>
                      <td>{c?.textVersion ?? '—'}</td>
                      <td>{c ? fechaHora(c.grantedAt) : '—'}</td>
                      <td>{c?.channel ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {revokedConsents.length > 0 && (
            <p className="ov-meta" style={{ marginTop: 8 }}>
              Revocados: {revokedConsents.map((c) => `${CONSENT_PURPOSES.find((p) => p.code === c.purpose)?.title ?? c.purpose} (v${c.textVersion}, revocado ${fecha(c.revokedAt)})`).join(' · ')}
            </p>
          )}
        </article>

        {/* ── Documentos ──────────────────────────────── */}
        <article className="ov-card s12">
          <header><h2>Checklist documental</h2><span className="ov-meta">{items.filter((i) => i.latest?.status === 'APPROVED').length} de {items.length} aprobados</span></header>
          {items.length ? (
            <div className="ov-list">
              {items.map(({ type, latest }) => {
                const history = (docsByType.get(type.id) ?? []).filter((d) => d.id !== latest?.id);
                const expired = latest?.status === 'APPROVED' && latest.expiresAt && latest.expiresAt.toISOString().slice(0, 10) < today;
                const st = latest ? DOC_STATUS[expired ? 'EXPIRED' : latest.status] : null;
                const pending = latest && (latest.status === 'UPLOADED' || latest.status === 'IN_REVIEW');
                return (
                  <div className="ov-row" key={type.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <span className={!latest ? 'ov-dot ov-dot--gray' : latest.status === 'APPROVED' && !expired ? 'ov-dot' : latest.status === 'REJECTED' || expired ? 'ov-dot ov-dot--red' : 'ov-dot ov-dot--amber'} style={{ marginTop: 6 }} />
                    <div className="grow">
                      <strong>{type.name}{type.required ? '' : ' (opcional)'}</strong>
                      {latest ? (
                        <>
                          <small>
                            {st && <Status tone={st.tone}>{st.label}</Status>} Versión {latest.version} · {latest.fileName} · cargado {fechaHora(latest.createdAt)}
                            {latest.expiresAt ? ` · vence ${fechaDia(latest.expiresAt)}` : ''}
                            {latest.reviewedById ? ` · revisor ${who(latest.reviewedById)}` : ''}
                          </small>
                          {latest.rejectReason && latest.status === 'REJECTED' && <small>Motivo del rechazo: {latest.rejectReason}</small>}
                          {history.length > 0 && (
                            <small>Versiones anteriores: {history.map((h) => `v${h.version} ${DOC_STATUS[h.status]?.label.toLowerCase()}${h.rejectReason ? ` (${h.rejectReason})` : ''}`).join(' · ')}</small>
                          )}
                        </>
                      ) : <small>Pendiente de carga{type.validityDays ? ` · vigencia ${type.validityDays} días` : ''}</small>}
                    </div>
                    <div className="ov-actions" style={{ marginTop: 0 }}>
                      {latest && latest.status !== 'QUARANTINED' && (
                        <a className="ov-btn ov-btn--secondary ov-btn--small" href={temporaryDocumentUrl(latest.id, session.user.id)} target="_blank" rel="noopener noreferrer">Ver (enlace 5 min)</a>
                      )}
                      {perm.review && latest?.status === 'UPLOADED' && (
                        <ActionForm action={takeDocAction} className="ove-inline-form">
                          <input type="hidden" name="opportunityId" value={opp.id} />
                          <input type="hidden" name="documentId" value={latest.id} />
                          <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Tomar en revisión</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                    {perm.review && pending && (
                      <div style={{ flexBasis: '100%' }}>
                        <details className="ove-details">
                          <summary>Revisar versión {latest.version}</summary>
                          <div className="ov-grid">
                            <div className="s6">
                              <ActionForm action={decideDocAction}>
                                <input type="hidden" name="opportunityId" value={opp.id} />
                                <input type="hidden" name="documentId" value={latest.id} />
                                <input type="hidden" name="decision" value="APPROVE" />
                                <p className="ov-meta">Al aprobar, vence {type.validityDays ? `en ${type.validityDays} días` : 'sin fecha'}.</p>
                                <SubmitButton>Aprobar</SubmitButton>
                              </ActionForm>
                            </div>
                            <div className="s6">
                              <ActionForm action={decideDocAction}>
                                <input type="hidden" name="opportunityId" value={opp.id} />
                                <input type="hidden" name="documentId" value={latest.id} />
                                <input type="hidden" name="decision" value="REJECT" />
                                <label className="ov-field"><span>Motivo del rechazo (obligatorio, lo verá el cliente)</span><textarea name="reason" required minLength={5} maxLength={500} /></label>
                                <SubmitButton className="ov-btn ov-btn--danger">Rechazar</SubmitButton>
                              </ActionForm>
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <Empty>No hay tipos documentales configurados para este producto.</Empty>}
          {perm.upload && (
            <details className="ove-details" style={{ marginTop: 12 }}>
              <summary>Cargar documento en nombre del cliente</summary>
              <ActionForm action={uploadDocAction} encType="multipart/form-data" className="ov-form ov-form--2" resetOnSuccess>
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field">
                  <span>Tipo de documento</span>
                  <select name="typeId" required defaultValue="">
                    <option value="" disabled>Elige…</option>
                    {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="ov-field"><span>Archivo (PDF, JPG o PNG, máx. 10 MB)</span><input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /></label>
                <div className="full"><SubmitButton pendingText="Cargando…">Cargar</SubmitButton></div>
              </ActionForm>
            </details>
          )}
        </article>

        {/* ── Ofertas ─────────────────────────────────── */}
        <article className="ov-card s12">
          <header><h2>Ofertas y comparación</h2>{accepted && <Status>Aceptada: {accepted.entityName}</Status>}</header>
          {offerRows.length ? (
            <div className="ov-tablewrap">
              <table className="ove-compare">
                <thead>
                  <tr>
                    <th>Entidad</th><th>Tasa EA</th><th>Plazo</th><th>Cuota</th><th>Intereses</th><th>Seguros</th><th>Costos</th><th>Costo total</th><th>Costo por millón</th>
                    {hasPortfolio && <th>Ahorro neto vs actual</th>}
                    <th>Vigencia</th>
                  </tr>
                </thead>
                <tbody>
                  {offerRows.map(({ offer: o, r }) => {
                    const expired = o.validUntil && o.validUntil.toISOString().slice(0, 10) < today;
                    return (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.entityName}</strong>{o.acceptedAt ? ' ✓' : ''}
                          <small className="ov-meta" style={{ display: 'block' }}>{SYSTEM_LABELS[o.system]} · {money(o.amount)} · fuente: {o.source}</small>
                        </td>
                        <td>{rate(o.rateEa)}</td>
                        <td>{o.termMonths} m</td>
                        <td className={r.payment === minPayment && offerRows.length > 1 ? 'best' : ''}>{money(r.payment)}</td>
                        <td>{money(r.totalInterest)}</td>
                        <td>{money(r.totalInsurance)}</td>
                        <td>{money(r.upfrontCosts)}</td>
                        <td className={r.totalCost === minTotal && offerRows.length > 1 ? 'best' : ''}>{money(r.totalCost)}</td>
                        <td>{money(r.costPerMillion)}</td>
                        {hasPortfolio && (
                          <td>{r.portfolio ? <>{money(r.portfolio.netSavings)}<small className="ov-meta" style={{ display: 'block' }}>{r.portfolio.recommendation}{r.portfolio.breakEvenMonths ? ` · equilibrio mes ${r.portfolio.breakEvenMonths}` : ''}</small></> : '—'}</td>
                        )}
                        <td>{o.validUntil ? (expired ? <Status tone="bad">Vencida {fechaDia(o.validUntil)}</Status> : fechaDia(o.validUntil)) : 'Sin fecha'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty>Aún no hay ofertas. Registra la primera con su fuente para comparar alternativas normalizadas.</Empty>}
          {offerRows.length > 0 && (
            <details className="ove-details" style={{ marginTop: 12 }}>
              <summary>Supuestos, advertencias y condiciones</summary>
              {offerRows.map(({ offer: o, r }) => (
                <div key={o.id} style={{ marginBottom: 12 }}>
                  <strong>{o.entityName}</strong> <span className="ov-meta">· motor {o.engineVersion} · registrada {fechaHora(o.createdAt)}{r.uvr ? ` · UVR ${r.uvr.value} con inflación ${pct(r.uvr.inflation, 2)} (${r.uvr.source})` : ''}</span>
                  {o.conditions && <p className="ov-meta" style={{ margin: '4px 0' }}>Condiciones: {o.conditions}</p>}
                  {r.portfolio && <p className="ov-meta" style={{ margin: '4px 0' }}>Frente a {r.portfolio.loanAlias}: cuota actual {money(r.portfolio.basePayment)} → {money(r.portfolio.newPayment)}. {r.portfolio.recommendationText}</p>}
                  {r.warnings?.length > 0 && <ul className="ov-assumptions">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                </div>
              ))}
              {offerRows[0] && <ul className="ov-assumptions">{offerRows[0].r.assumptions?.map((a) => <li key={a}>{a}</li>)}</ul>}
            </details>
          )}
          {accepted && accepted.acceptEvidence && (
            <p className="ov-meta" style={{ marginTop: 10 }}>Aceptación registrada el {fechaHora(accepted.acceptedAt)} por {who(accepted.acceptedById)} · canal {(accepted.acceptEvidence as { channel?: string }).channel} · “{(accepted.acceptEvidence as { declaration?: string }).declaration}”</p>
          )}
          {perm.offer && !accepted && offerRows.length > 0 && (
            <details className="ove-details" style={{ marginTop: 12 }}>
              <summary>Registrar aceptación del cliente</summary>
              <ActionForm action={acceptOfferAction} className="ov-form ov-form--2">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field">
                  <span>Oferta aceptada</span>
                  <select name="offerId" required defaultValue="">
                    <option value="" disabled>Elige…</option>
                    {offerRows.filter(({ offer: o }) => !(o.validUntil && o.validUntil.toISOString().slice(0, 10) < today)).map(({ offer: o, r }) => (
                      <option key={o.id} value={o.id}>{o.entityName} · {money(r.payment)} / {o.termMonths} m</option>
                    ))}
                  </select>
                </label>
                <label className="ov-field">
                  <span>Canal de la aceptación</span>
                  <select name="channel" required defaultValue="PRESENCIAL">
                    <option value="PRESENCIAL">Presencial</option><option value="LLAMADA">Llamada</option><option value="VIDEOLLAMADA">Videollamada</option><option value="CORREO">Correo</option><option value="WHATSAPP">WhatsApp</option>
                  </select>
                </label>
                <label className="ov-field full"><span>Declaración (qué vio el cliente y cómo aceptó)</span><textarea name="declaration" required minLength={10} maxLength={1000} placeholder="El cliente revisó cuota, costo total, supuestos y vigencia, y aceptó por…" /></label>
                <p className="ov-meta full">Se guardan como evidencia los resultados exactos que se le presentaron. Solo puede haber una oferta aceptada por caso.</p>
                <div className="full"><SubmitButton>Registrar aceptación</SubmitButton></div>
              </ActionForm>
            </details>
          )}
          {perm.offer && !['WITHDRAWN', 'POSTSALE'].includes(opp.stage) && (
            <details className="ove-details" style={{ marginTop: 12 }}>
              <summary>Registrar nueva oferta</summary>
              <ActionForm action={createOfferAction} className="ov-form ov-form--3" resetOnSuccess>
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field">
                  <span>Entidad</span>
                  <select name="entityName" defaultValue={opp.entity?.name ?? ''}>
                    <option value="">Otra (escríbela)</option>
                    {entities.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                  </select>
                </label>
                <label className="ov-field"><span>Otra entidad</span><input name="entityOther" maxLength={120} /></label>
                <label className="ov-field"><span>Tasa EA (%)</span><input name="rateEa" inputMode="decimal" required placeholder="Ej. 12,5" /></label>
                <label className="ov-field">
                  <span>Sistema</span>
                  <select name="system" defaultValue="FIXED_PESOS"><option value="FIXED_PESOS">Pesos, cuota fija</option><option value="UVR">UVR</option></select>
                </label>
                <label className="ov-field"><span>Plazo (meses)</span><input name="termMonths" type="number" min={12} max={360} required defaultValue={240} /></label>
                <label className="ov-field"><span>Monto</span><input name="amount" inputMode="numeric" required defaultValue={opp.amount ? toNumber(opp.amount).toLocaleString('es-CO') : ''} /></label>
                <label className="ov-field"><span>Seguros mensuales</span><input name="monthlyInsurance" inputMode="numeric" placeholder="0" /></label>
                <label className="ov-field"><span>Costos iniciales (estudio, avalúo, notariales)</span><input name="upfrontCosts" inputMode="numeric" placeholder="0" /></label>
                <label className="ov-field"><span>Vigencia hasta</span><input name="validUntil" type="date" /></label>
                <label className="ov-field full"><span>Fuente (obligatoria)</span><input name="source" required minLength={3} maxLength={200} placeholder="Ej. Oferta escrita de la entidad del 20-sep-2026" /></label>
                <label className="ov-field full"><span>Condiciones</span><textarea name="conditions" maxLength={2000} /></label>
                <p className="ov-meta full">Los resultados se calculan con el motor financiero versionado{person.loans.some((l) => l.active) ? ' y se comparan contra el crédito activo del cliente' : ''}.</p>
                <div className="full"><SubmitButton pendingText="Calculando…">Calcular y guardar oferta</SubmitButton></div>
              </ActionForm>
            </details>
          )}
        </article>

        {/* ── Interacciones ───────────────────────────── */}
        <article className="ov-card s6">
          <h2>Interacciones y notas</h2>
          {perm.note && (
            <details className="ove-details" style={{ marginBottom: 12 }}>
              <summary>Registrar interacción</summary>
              <ActionForm action={addInteractionAction} resetOnSuccess>
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field">
                  <span>Canal</span>
                  <select name="channel" defaultValue="LLAMADA">{Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <label className="ov-field"><span>Resumen</span><textarea name="summary" required maxLength={4000} /></label>
                <label className="ov-check"><input type="checkbox" name="visibleToClient" /><span>Visible para el cliente (le llegará una notificación)</span></label>
                <SubmitButton>Guardar</SubmitButton>
              </ActionForm>
            </details>
          )}
          {opp.interactions.length ? (
            <div className="ov-list">
              {opp.interactions.map((i) => (
                <div key={i.id} className={i.visibleToClient ? 'ove-msg' : 'ove-msg ove-msg--internal'}>
                  <small>{CHANNEL_LABELS[i.channel] ?? i.channel} · {who(i.byUserId)} · {fechaHora(i.createdAt)} · {i.visibleToClient ? 'visible al cliente' : 'interna'}</small>
                  <p>{i.summary}</p>
                </div>
              ))}
            </div>
          ) : <Empty>Sin interacciones registradas.</Empty>}
        </article>

        {/* ── Tareas ──────────────────────────────────── */}
        <article className="ov-card s6">
          <h2>Tareas</h2>
          {perm.note && (
            <details className="ove-details" style={{ marginBottom: 12 }}>
              <summary>Nueva tarea</summary>
              <ActionForm action={createTaskAction} className="ov-form ov-form--2" resetOnSuccess>
                <input type="hidden" name="opportunityId" value={opp.id} />
                <label className="ov-field full"><span>Título</span><input name="title" required maxLength={200} /></label>
                <label className="ov-field">
                  <span>Tipo</span>
                  <select name="kind" defaultValue="TAREA">{Object.entries(TASK_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <label className="ov-field">
                  <span>Responsable</span>
                  <select name="assigneeId" defaultValue={session.user.id} required>
                    {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
                <label className="ov-field"><span>Vence (hora Colombia)</span><input name="dueAt" type="datetime-local" required /></label>
                <label className="ov-field full"><span>Detalle</span><textarea name="detail" maxLength={2000} /></label>
                <div className="full"><SubmitButton>Crear tarea</SubmitButton></div>
              </ActionForm>
            </details>
          )}
          {opp.tasks.length ? (
            <div className="ov-list">
              {opp.tasks.map((t) => {
                const overdue = t.status === 'OPEN' && t.dueAt.getTime() < nowMs;
                return (
                  <div className="ov-row" key={t.id}>
                    <span className={t.status !== 'OPEN' ? 'ov-dot ov-dot--gray' : overdue ? 'ov-dot ov-dot--red' : 'ov-dot ov-dot--amber'} />
                    <div className="grow">
                      <strong>{TASK_KINDS[t.kind] ?? t.kind}: {t.title}</strong>
                      <small>{t.assignee.name} · vence {fechaHora(t.dueAt)}{overdue ? ' · vencida' : ''}{t.status === 'DONE' ? ` · completada ${fechaHora(t.doneAt)}` : t.status === 'CANCELLED' ? ' · cancelada' : ''}</small>
                      {t.detail && <small>{t.detail}</small>}
                    </div>
                    {perm.note && t.status === 'OPEN' && (
                      <>
                        <ActionForm action={updateTaskAction} className="ove-inline-form">
                          <input type="hidden" name="opportunityId" value={opp.id} /><input type="hidden" name="taskId" value={t.id} /><input type="hidden" name="status" value="DONE" />
                          <SubmitButton className="ov-btn ov-btn--small">Hecha</SubmitButton>
                        </ActionForm>
                        <ActionForm action={updateTaskAction} className="ove-inline-form">
                          <input type="hidden" name="opportunityId" value={opp.id} /><input type="hidden" name="taskId" value={t.id} /><input type="hidden" name="status" value="CANCELLED" />
                          <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Cancelar</SubmitButton>
                        </ActionForm>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <Empty>Sin tareas. Crea una para no perder el siguiente paso.</Empty>}
        </article>

        {/* ── Comisiones ──────────────────────────────── */}
        <article className="ov-card s12">
          <h2>Comisiones del caso</h2>
          {opp.commissions.length ? (
            <div className="ov-tablewrap">
              <table className="ov-table">
                <thead><tr><th>Regla</th><th className="num">Base</th><th className="num">%</th><th className="num">Bruto</th><th className="num">Retención</th><th className="num">Neto</th><th>Estado</th><th>Pago previsto</th></tr></thead>
                <tbody>
                  {opp.commissions.map((c) => {
                    const st = COMMISSION_STATUS[c.status];
                    return (
                      <tr key={c.id}>
                        <td>{c.rule.name} v{c.rule.version}<small>Causada {fechaHora(c.causedAt)}</small></td>
                        <td className="num">{money(c.baseAmount)}</td>
                        <td className="num">{pct(Number(c.percent.toString()), 2)}</td>
                        <td className="num">{money(c.gross)}</td>
                        <td className="num">{money(c.withholding)}</td>
                        <td className="num">{money(c.net)}</td>
                        <td><Status tone={st.tone}>{st.label}</Status>{c.paymentRef && <small>Ref. {c.paymentRef}</small>}{c.reverseReason && <small>Reverso: {c.reverseReason}</small>}</td>
                        <td>{fechaDia(c.expectedPayAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty>{opp.allyOrgId ? 'La comisión se causa al registrar el desembolso.' : 'Caso directo: no genera comisión de aliado.'}</Empty>}
        </article>

        {/* ── Bitácora ────────────────────────────────── */}
        <article className="ov-card s12">
          <header><h2>Bitácora del caso</h2><span className="ov-meta">Últimos 50 eventos · inmutable</span></header>
          {events.length ? (
            <div className="ov-tablewrap">
              <table className="ov-table">
                <thead><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Antes</th><th>Después</th></tr></thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id.toString()}>
                      <td>{fechaHora(e.at)}<small>#{e.id.toString()} · {e.channel}</small></td>
                      <td>{e.action}<small>{e.entity}</small></td>
                      <td>{who(e.actorId)}{e.actorRole ? <small>{ROLE_LABELS[e.actorRole as keyof typeof ROLE_LABELS] ?? e.actorRole}</small> : null}</td>
                      <td style={{ minWidth: 180 }}><JsonBlock value={e.before} /></td>
                      <td style={{ minWidth: 180 }}><JsonBlock value={e.after} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>Sin eventos registrados.</Empty>}
        </article>
      </div>
    </>
  );
}
