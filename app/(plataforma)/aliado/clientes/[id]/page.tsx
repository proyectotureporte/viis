import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AllyForm } from '@/components/aliado/AllyForm';
import { RevealContact } from '@/components/aliado/RevealContact';
import { TaskForm } from '@/components/aliado/TaskForm';
import { TaskItem } from '@/components/aliado/TaskItem';
import { SubmitButton } from '@/components/ov/forms';
import { Empty, Notice, PageHeader, Status } from '@/components/ov/ui';
import { allyCases, NIL_UUID, personName } from '@/lib/aliado/scope';
import { bogotaYmd, daysBetween } from '@/lib/aliado/time';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { allyBlockingCertifications } from '@/lib/domain/cases';
import { checklist } from '@/lib/domain/documents';
import {
  COMMISSION_STATUS,
  DOC_STATUS,
  DOCUMENT_TYPES_ID,
  fecha,
  fechaDia,
  fechaHora,
  money,
  pct,
  PIPELINE_STAGES,
  PRODUCTS,
  slaText,
  STAGE_LABELS,
} from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import { temporaryDocumentUrl } from '@/lib/storage';
import {
  addConsentAction,
  addInteractionAction,
  allyStageAction,
  inviteClientAction,
  revealContactAction,
  uploadDocumentAction,
  withdrawAction,
} from '../actions';

export const metadata: Metadata = { title: 'Ficha del cliente' };

const CHANNELS: Record<string, string> = { LLAMADA: 'Llamada', VISITA: 'Visita', WHATSAPP: 'WhatsApp', CORREO: 'Correo', NOTA: 'Nota interna' };
const CLOSED = ['WITHDRAWN', 'DISBURSED', 'POSTSALE'];

export default async function FichaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  const session = await requireUser({ portal: 'aliado', permission: 'case.read' });
  const { id } = await params;
  const { nuevo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const prisma = getPrisma();
  const { user } = session;

  const opportunity = await prisma.opportunity.findFirst({
    where: { id, ...allyCases(user) },
    include: {
      person: { include: { consents: { where: { revokedAt: null }, orderBy: { grantedAt: 'desc' } } } },
      entity: { select: { name: true } },
      allyUser: { select: { id: true, name: true } },
      allyOrg: { select: { name: true } },
      stages: { orderBy: { createdAt: 'asc' } },
      offers: { orderBy: { createdAt: 'desc' } },
      commissions: { where: { allyOrgId: user.organizationId ?? NIL_UUID } },
    },
  });
  if (!opportunity) notFound();
  const { person } = opportunity;

  const orgUsers = user.organizationId
    ? await prisma.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } })
    : [{ id: user.id, name: user.name }];
  const orgUserIds = orgUsers.map((u) => u.id);
  const nameOf = (userId: string | null) => orgUsers.find((u) => u.id === userId)?.name ?? 'Equipo OpenV';

  const [items, blocking, interactions, tasks, emailAccount] = await Promise.all([
    checklist(prisma, person.id, opportunity.product),
    opportunity.allyUserId ? allyBlockingCertifications(prisma, opportunity.allyUserId) : Promise.resolve([] as string[]),
    prisma.interaction.findMany({
      where: { opportunityId: opportunity.id, OR: [{ byUserId: { in: orgUserIds } }, { visibleToClient: true }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.task.findMany({
      where: { opportunityId: opportunity.id, assigneeId: { in: orgUserIds } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 50,
      include: { assignee: { select: { name: true } } },
    }),
    person.email && !person.userId ? prisma.user.findUnique({ where: { email: person.email }, select: { id: true } }) : Promise.resolve(null),
  ]);

  const closed = CLOSED.includes(opportunity.stage);
  const stageIndex = PIPELINE_STAGES.indexOf(opportunity.stage === 'POSTSALE' ? 'DISBURSED' : opportunity.stage);
  const sla = closed ? null : slaText(opportunity.slaDueAt);
  const consented = new Set(person.consents.map((c) => c.purpose));
  const pendingConsents = CONSENT_PURPOSES.filter((p) => !consented.has(p.code));
  const requiredMissing = items.filter((i) => i.type.required && i.latest?.status !== 'APPROVED');
  const canInvite = Boolean(person.email && !person.userId && !emailAccount);
  const commission = opportunity.commissions[0];
  const today = bogotaYmd();

  return (
    <>
      <PageHeader
        title={personName(person)}
        subtitle={`${opportunity.code} · ${PRODUCTS[opportunity.product] ?? opportunity.product}${opportunity.entity ? ` · ${opportunity.entity.name}` : ''}`}
        actions={<Link className="ov-btn ov-btn--secondary" href="/aliado/clientes">Volver a clientes</Link>}
      />

      {nuevo === '1' && (
        <Notice tone="info">
          Caso creado. Siguiente paso: contacta al cliente y márcalo como contactado; luego reúne los documentos de la lista.
          {canInvite && ' Si aún no lo invitaste, puedes enviarle la invitación para que siga su caso desde su cuenta.'}
        </Notice>
      )}
      {blocking.length > 0 && !closed && (
        <Notice tone="danger">
          <strong>Radicación bloqueada.</strong> {opportunity.allyUserId === user.id ? 'Tienes' : `${nameOf(opportunity.allyUserId)} tiene`} certificaciones críticas vencidas o pendientes: {blocking.join(', ')}.{' '}
          <Link href="/aliado/academia">Renovarlas en la Academia</Link>.
        </Notice>
      )}
      {!consented.has('ENTIDADES') && !closed && (
        <Notice>Falta la autorización del cliente para compartir su expediente con entidades financieras. Sin ella el caso no se puede radicar.</Notice>
      )}

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s5">
          <h2>Cliente</h2>
          <dl className="ov-dl">
            <dt>Documento</dt><dd>{DOCUMENT_TYPES_ID[person.documentType] ?? person.documentType} · ···{person.documentLast4}</dd>
            <dt>Correo</dt><dd>{person.email ?? '—'}</dd>
            <dt>Celular</dt><dd>{person.phoneEnc ? <RevealContact action={revealContactAction} opportunityId={opportunity.id} /> : '—'}</dd>
            <dt>Ciudad</dt><dd>{person.city ?? '—'}</dd>
            <dt>Ingreso mensual</dt><dd>{person.monthlyIncome ? <>{money(person.monthlyIncome)} <span className="ov-conf ov-conf--DECLARED">Declarado</span></> : '—'}</dd>
            <dt>Cuenta OpenV</dt><dd>{person.userId ? 'Sí, sigue su caso en línea' : 'Aún no tiene cuenta'}</dd>
            <dt>Registrado por</dt><dd>{opportunity.allyOrg?.name ?? '—'}{opportunity.allyUser ? ` · ${opportunity.allyUser.name}` : ''}</dd>
          </dl>
          {canInvite && (
            <AllyForm action={inviteClientAction} className="ov-actions" compact>
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small" pendingText="Enviando…">Invitar a crear su cuenta</SubmitButton>
            </AllyForm>
          )}
          {pendingConsents.length > 0 && !closed && (
            <details className="ov-details" style={{ marginTop: 14 }}>
              <summary>Registrar autorizaciones pendientes</summary>
              <AllyForm action={addConsentAction} className="ov-form">
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                {pendingConsents.map((p) => (
                  <label key={p.code} className="ov-check">
                    <input type="checkbox" name="consents" value={p.code} />
                    <span><strong>{p.title}.</strong> {p.text}</span>
                  </label>
                ))}
                <label className="ov-check">
                  <input type="checkbox" name="declaration" required />
                  <span><strong>El cliente me autorizó expresamente y conservo la evidencia.</strong></span>
                </label>
                <SubmitButton className="ov-btn ov-btn--small">Registrar autorización</SubmitButton>
              </AllyForm>
            </details>
          )}
          <p className="ov-meta" style={{ marginTop: 12 }}>
            Autorizaciones vigentes: {person.consents.length ? [...consented].map((c) => CONSENT_PURPOSES.find((p) => p.code === c)?.title ?? c).join(' · ') : 'ninguna'}
          </p>
        </article>

        <article className="ov-card s7">
          <header>
            <h2>Etapa: {STAGE_LABELS[opportunity.stage]}</h2>
            {sla && <Status tone={sla.tone}>{sla.tone === 'bad' ? sla.text : `SLA: ${sla.text}`}</Status>}
          </header>
          <div className="ov-steps al-steps" aria-label="Avance del caso">
            {PIPELINE_STAGES.map((stage, i) => (
              <span key={stage} className={opportunity.stage === 'WITHDRAWN' ? '' : i < stageIndex ? 'done' : i === stageIndex ? 'now' : ''} aria-current={i === stageIndex ? 'step' : undefined}>
                {STAGE_LABELS[stage]}
              </span>
            ))}
            {opportunity.stage === 'WITHDRAWN' && <span className="bad">Desistido</span>}
          </div>
          <p className="ov-meta">
            {daysBetween(opportunity.stageAt) === 0 ? 'En esta etapa desde hoy' : `${daysBetween(opportunity.stageAt)} días en esta etapa`}
            {opportunity.amount ? ` · monto estimado ${money(opportunity.amount)}` : ''}
            {opportunity.disbursedAmount ? ` · desembolsado ${money(opportunity.disbursedAmount)}` : ''}
          </p>
          {opportunity.nextAction && !closed && <p><strong>Siguiente paso:</strong> {opportunity.nextAction}</p>}
          {opportunity.withdrawReason && <p><strong>Causa del desistimiento:</strong> {opportunity.withdrawReason}</p>}

          {!closed && (
            <div className="ov-actions">
              {opportunity.stage === 'LEAD' && (
                <AllyForm action={allyStageAction} className="al-inline-form" compact>
                  <input type="hidden" name="opportunityId" value={opportunity.id} />
                  <input type="hidden" name="to" value="CONTACTED" />
                  <SubmitButton className="ov-btn ov-btn--small">Marcar contactado</SubmitButton>
                </AllyForm>
              )}
              {opportunity.stage === 'CONTACTED' && (
                <AllyForm action={allyStageAction} className="al-inline-form" compact>
                  <input type="hidden" name="opportunityId" value={opportunity.id} />
                  <input type="hidden" name="to" value="PROFILED" />
                  <SubmitButton className="ov-btn ov-btn--small">Marcar perfilado</SubmitButton>
                </AllyForm>
              )}
              <details className="ov-details" style={{ flexBasis: '100%' }}>
                <summary>El cliente desiste</summary>
                <AllyForm action={withdrawAction} className="ov-inline">
                  <input type="hidden" name="opportunityId" value={opportunity.id} />
                  <label className="ov-field">
                    <span>Causa</span>
                    <select name="reason" required defaultValue="">
                      <option value="" disabled>Elige la causa</option>
                      <option>No le interesa por ahora</option>
                      <option>Tomó otra oferta o entidad</option>
                      <option>No cumple requisitos de ingresos</option>
                      <option>No completó los documentos</option>
                      <option>Costos o tasa no convenientes</option>
                      <option>No fue posible contactarlo</option>
                    </select>
                  </label>
                  <SubmitButton className="ov-btn ov-btn--danger ov-btn--small" confirm="¿Marcar el caso como desistido? Solo el equipo OpenV podrá reabrirlo.">Marcar desistido</SubmitButton>
                </AllyForm>
              </details>
            </div>
          )}
          <p className="ov-meta" style={{ marginTop: 10 }}>Desde Perfilado en adelante, el equipo OpenV mueve las etapas (documentación, radicación, aprobación, firma y desembolso).</p>

          <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>Línea de tiempo</h3>
          <ol className="ov-timeline">
            {[...opportunity.stages].reverse().map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.from ? `${STAGE_LABELS[s.from]} → ${STAGE_LABELS[s.to]}` : STAGE_LABELS[s.to]}</strong>
                  <small className="ov-meta" style={{ display: 'block' }}>{fechaHora(s.createdAt)} · {nameOf(s.byUserId)}{s.note ? ` · ${s.note}` : ''}</small>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </div>

      <div className="ov-grid">
        <article className="ov-card s7 al-checklist">
          <header>
            <h2>Qué falta</h2>
            <span className={requiredMissing.length ? 'ov-status ov-status--wait' : 'ov-status'}>
              {requiredMissing.length ? `${requiredMissing.length} ${requiredMissing.length === 1 ? 'requerido pendiente' : 'requeridos pendientes'}` : 'Requeridos al día'}
            </span>
          </header>
          <details className="ov-details">
            <summary>Consejos para una foto o escaneo legible</summary>
            <ul className="al-tips">
              <li>Documento completo, sin dedos ni bordes cortados, sobre una superficie oscura y plana.</li>
              <li>Luz natural o de frente; evita reflejos y flash sobre plásticos.</li>
              <li>Cédula por ambas caras en un mismo PDF, o dos fotos una después de otra.</li>
              <li>Formatos PDF, JPG o PNG de máximo 10 MB. Nunca envíes documentos por WhatsApp o correo personal.</li>
              <li>Verifica la fecha de expedición: certificados laborales, de deuda y de tradición no deben superar 30 días.</li>
            </ul>
          </details>
          {items.length === 0 ? (
            <Empty>No hay documentos configurados para este producto.</Empty>
          ) : (
            <div className="ov-list" style={{ marginTop: 10 }}>
              {items.map(({ type, latest }) => {
                const status = latest ? DOC_STATUS[latest.status] : null;
                const canView = latest && latest.status !== 'QUARANTINED';
                return (
                  <div className="ov-row" key={type.id}>
                    <span className={latest?.status === 'APPROVED' ? 'ov-dot' : latest?.status === 'REJECTED' || latest?.status === 'EXPIRED' ? 'ov-dot ov-dot--red' : latest ? 'ov-dot ov-dot--amber' : 'ov-dot ov-dot--gray'} />
                    <div className="grow">
                      <strong>{type.name}{!type.required && <span className="al-tag">Opcional</span>}</strong>
                      <small>{type.description}</small>
                      {latest && (
                        <small>
                          Versión {latest.version} · {fecha(latest.createdAt)}
                          {latest.expiresAt ? ` · vence ${fechaDia(latest.expiresAt)}` : ''}
                          {latest.status === 'REJECTED' && latest.rejectReason ? <span className="ov-negative"> · Rechazado: {latest.rejectReason}</span> : ''}
                        </small>
                      )}
                    </div>
                    {status ? <Status tone={status.tone}>{status.label}</Status> : <Status tone="gray">Pendiente</Status>}
                    {canView && (
                      <a className="ov-btn ov-btn--secondary ov-btn--small" href={temporaryDocumentUrl(latest.id, user.id)} target="_blank" rel="noopener noreferrer">
                        Ver
                      </a>
                    )}
                    {!closed && latest?.status !== 'APPROVED' && (
                      <AllyForm action={uploadDocumentAction} className="al-upload" compact resetOnSuccess>
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <input type="hidden" name="typeId" value={type.id} />
                        <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required aria-label={`Archivo para ${type.name}`} />
                        <SubmitButton className="ov-btn ov-btn--small" pendingText="Cargando…">{latest ? 'Cargar nueva versión' : 'Cargar'}</SubmitButton>
                      </AllyForm>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="ov-card s5">
          <h2>Tareas del caso</h2>
          {tasks.length === 0 ? (
            <p className="ov-meta">Sin tareas. Agenda la próxima llamada o cita para no perder el hilo.</p>
          ) : (
            <div className="ov-list">
              {tasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={{ ...t, assigneeName: t.assigneeId !== user.id ? t.assignee.name : undefined }}
                  editable={t.assigneeId === user.id}
                />
              ))}
            </div>
          )}
          {!closed && (
            <details className="ov-details" style={{ marginTop: 12 }}>
              <summary>Nueva tarea o cita</summary>
              <TaskForm today={today} opportunityId={opportunity.id} />
            </details>
          )}
        </article>
      </div>

      <div className="ov-grid">
        <article className="ov-card s7">
          <h2>Interacciones</h2>
          <AllyForm action={addInteractionAction} className="ov-form ov-form--2" resetOnSuccess>
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <label className="ov-field">
              <span>Canal</span>
              <select name="channel" defaultValue="LLAMADA">
                {Object.entries(CHANNELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            <label className="ov-check" style={{ alignSelf: 'end', paddingBottom: 10 }}>
              <input type="checkbox" name="visibleToClient" />
              <span>Visible para el cliente en su portal</span>
            </label>
            <label className="ov-field full"><span>Resumen</span><textarea name="summary" required maxLength={2000} rows={3} placeholder="Qué se habló, qué se acordó y cuál es el siguiente paso." /></label>
            <div className="full"><SubmitButton className="ov-btn ov-btn--small" pendingText="Guardando…">Registrar interacción</SubmitButton></div>
          </AllyForm>
          {interactions.length === 0 ? (
            <p className="ov-meta" style={{ marginTop: 12 }}>Aún no hay interacciones registradas. Lo que no está registrado, no ocurrió.</p>
          ) : (
            <ol className="ov-timeline" style={{ marginTop: 16 }}>
              {interactions.map((i) => (
                <li key={i.id}>
                  <div>
                    <strong>{CHANNELS[i.channel] ?? i.channel}</strong>
                    {i.visibleToClient && <span className="al-tag">Visible al cliente</span>}
                    <small className="ov-meta" style={{ display: 'block' }}>{fechaHora(i.createdAt)} · {nameOf(i.byUserId)}</small>
                    <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{i.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>

        <div className="s5" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <article className="ov-card">
            <h2>Ofertas</h2>
            {opportunity.offers.length === 0 ? (
              <p className="ov-meta">Todavía no hay ofertas. Las registra el equipo OpenV cuando la entidad responde.</p>
            ) : (
              <div className="ov-list">
                {opportunity.offers.map((o) => (
                  <div className="ov-row" key={o.id} style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <strong>{o.entityName} · {pct(Number(o.rateEa), 2)} E.A.{o.system === 'UVR' ? ' + UVR' : ''}</strong>
                      <small>{money(o.amount)} a {o.termMonths} meses{o.monthlyInsurance > BigInt(0) ? ` · seguros ${money(o.monthlyInsurance)}/mes` : ''}{o.upfrontCosts > BigInt(0) ? ` · costos iniciales ${money(o.upfrontCosts)}` : ''}</small>
                      <small>Fuente: {o.source}{o.validUntil ? ` · vigente hasta ${fechaDia(o.validUntil)}` : ''}</small>
                      {o.conditions && <small>{o.conditions}</small>}
                    </div>
                    {o.acceptedAt ? <Status>Aceptada {fecha(o.acceptedAt)}</Status> : <Status tone="info">En estudio</Status>}
                  </div>
                ))}
              </div>
            )}
          </article>
          <article className="ov-card">
            <h2>Comisión</h2>
            {commission ? (
              <>
                <p style={{ margin: 0 }}>
                  <span className="ov-money">{money(commission.net)}</span> netos · <Status tone={COMMISSION_STATUS[commission.status]?.tone}>{COMMISSION_STATUS[commission.status]?.label ?? commission.status}</Status>
                </p>
                <p className="ov-meta">{money(commission.baseAmount)} × {pct(Number(commission.percent), 2)} = {money(commission.gross)} − retención {money(commission.withholding)} · pago previsto {fechaDia(commission.expectedPayAt)}</p>
                <Link href={`/aliado/comisiones#c-${commission.id}`}>Ver liquidación completa</Link>
              </>
            ) : (
              <p className="ov-meta">La comisión se causa automáticamente cuando el caso se desembolsa, con la regla vigente al crear el caso. <Link href="/aliado/comisiones#reglas">Ver mis reglas</Link></p>
            )}
          </article>
        </div>
      </div>
    </>
  );
}
