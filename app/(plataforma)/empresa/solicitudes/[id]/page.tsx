import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Notice, PageHeader, Status } from '@/components/ov/ui';
import { JsonBlock } from '@/components/empresa/ui';
import { activeStaff } from '@/lib/empresa/access';
import { spUuid } from '@/lib/empresa/params';
import { fecha, fechaHora, REQUEST_KINDS, REQUEST_STATUS, slaText } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { ROLE_LABELS } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { assignRequestAction, changeRequestStatusAction, closeRequestAction, messageRequestAction, takeRequestAction } from '../actions';

export const metadata: Metadata = { title: 'Solicitud' };

const STAFF_STATUS_LABEL: Record<string, string> = { WAITING_CLIENT: 'Esperando al cliente' };
const statusLabel = (s: string) => STAFF_STATUS_LABEL[s] ?? REQUEST_STATUS[s]?.label ?? s;

export default async function SolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'request.manage' });
  const id = spUuid(await params, 'id');
  if (!id) notFound();
  const prisma = getPrisma();
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, firstName: true, lastName: true, email: true, userId: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!request) notFound();
  const authorIds = [...new Set([...request.messages.map((m) => m.byUserId), request.createdById].filter((v): v is string => Boolean(v)))];
  const [authors, staff, scenario] = await Promise.all([
    authorIds.length ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, role: true } }) : [],
    activeStaff(),
    request.scenarioId ? prisma.scenario.findUnique({ where: { id: request.scenarioId }, select: { id: true, name: true, kind: true, results: true, assumptions: true, engineVersion: true, inputsHash: true, createdAt: true, userId: true } }) : null,
  ]);
  const sharedScenario = scenario && scenario.userId === request.person.userId ? scenario : null;
  const closed = request.status === 'RESOLVED' || request.status === 'REJECTED';
  const sla = slaText(request.slaDueAt);
  const author = (uid: string) => authors.find((a) => a.id === uid);
  const assignee = staff.find((u) => u.id === request.assigneeId);

  return (
    <>
      <PageHeader
        title={`${request.code} · ${request.subject}`}
        subtitle={`${REQUEST_KINDS[request.kind]?.label ?? request.kind} · creada ${fechaHora(request.createdAt)}`}
        actions={<Link className="ov-btn ov-btn--secondary" href="/empresa/solicitudes">Volver</Link>}
      />
      <div className="ov-grid">
        <article className="ov-card s8">
          <h2>Detalle</h2>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{request.detail}</p>
          {request.resolution && <Notice tone="info"><strong>Resolución:</strong> {request.resolution}</Notice>}

          <h2 style={{ marginTop: 20 }}>Conversación</h2>
          {request.messages.length === 0 ? <div className="ov-empty">Aún no hay mensajes.</div> : (
            <div className="ov-list">
              {request.messages.map((m) => {
                const a = author(m.byUserId);
                const fromClient = m.byUserId === request.person.userId;
                return (
                  <div key={m.id} className={m.internal ? 'ove-msg ove-msg--internal' : 'ove-msg'}>
                    <small>
                      {fromClient ? `${request.person.firstName} (cliente)` : a ? `${a.name} · ${ROLE_LABELS[a.role]}` : 'Usuario'} · {fechaHora(m.createdAt)}
                      {m.internal ? ' · Nota interna (no visible para el cliente)' : ''}
                    </small>
                    <p>{m.body}</p>
                  </div>
                );
              })}
            </div>
          )}

          <h2 style={{ marginTop: 20 }}>{closed ? 'Agregar nota interna' : 'Responder o anotar'}</h2>
          <ActionForm action={messageRequestAction} className="ov-form" resetOnSuccess>
            <input type="hidden" name="requestId" value={request.id} />
            <label className="ov-field"><span>Mensaje</span><textarea name="body" required minLength={2} maxLength={4000} /></label>
            {closed ? <input type="hidden" name="internal" value="on" /> : (
              <label className="ov-check"><input type="checkbox" name="internal" /><span>Nota interna (el cliente no la ve y no se le notifica)</span></label>
            )}
            <div><SubmitButton>{closed ? 'Guardar nota' : 'Enviar'}</SubmitButton></div>
          </ActionForm>
        </article>

        <aside className="s4" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <article className="ov-card">
            <h2>Estado</h2>
            <p><Status tone={REQUEST_STATUS[request.status]?.tone}>{statusLabel(request.status)}</Status></p>
            <dl className="ov-dl">
              <dt>Cliente</dt><dd><Link href={`/empresa/clientes/${request.person.id}`}>{request.person.firstName} {request.person.lastName}</Link></dd>
              <dt>Cuenta</dt><dd>{request.person.userId ? 'Recibe avisos en la app' : 'Sin cuenta: no recibe avisos'}</dd>
              <dt>SLA</dt><dd>{fechaHora(request.slaDueAt)}{!closed && <><br /><Status tone={sla.tone}>{sla.text}</Status></>}</dd>
              <dt>Responsable</dt><dd>{assignee ? assignee.name : request.assigneeId ? 'Usuario inactivo' : 'Sin asignar'}</dd>
            </dl>
            {!closed && (
              <div className="ove-stack-list" style={{ marginTop: 14, gap: 10 }}>
                {request.assigneeId !== session.user.id && (
                  <ActionForm action={takeRequestAction} className="ove-inline-form">
                    <input type="hidden" name="requestId" value={request.id} />
                    <SubmitButton className="ov-btn ov-btn--small">Tomar solicitud</SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={assignRequestAction} className="ove-inline-form">
                  <input type="hidden" name="requestId" value={request.id} />
                  <label className="ove-sr" htmlFor="assign-req">Responsable</label>
                  <select id="assign-req" name="assigneeId" defaultValue={request.assigneeId ?? ''}>
                    <option value="">Sin asignar</option>
                    {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Asignar</SubmitButton>
                </ActionForm>
                <ActionForm action={changeRequestStatusAction} className="ove-inline-form">
                  <input type="hidden" name="requestId" value={request.id} />
                  <label className="ove-sr" htmlFor="status-req">Estado</label>
                  <select id="status-req" name="status" defaultValue={request.status}>
                    {(['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] as const).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                  <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Cambiar estado</SubmitButton>
                </ActionForm>
              </div>
            )}
          </article>

          {!closed && (
            <article className="ov-card">
              <h2>Cerrar solicitud</h2>
              <ActionForm action={closeRequestAction} className="ov-form">
                <input type="hidden" name="requestId" value={request.id} />
                <label className="ov-field"><span>Resultado</span>
                  <select name="outcome" required defaultValue="RESOLVED">
                    <option value="RESOLVED">Resuelta</option>
                    <option value="REJECTED">No procedente</option>
                  </select>
                </label>
                <label className="ov-field"><span>Resolución para el cliente (obligatoria)</span><textarea name="resolution" required minLength={10} maxLength={4000} /></label>
                <div><SubmitButton confirm="¿Cerrar la solicitud y notificar al cliente?">Cerrar y notificar</SubmitButton></div>
              </ActionForm>
            </article>
          )}

          {sharedScenario && (
            <article className="ov-card">
              <h2>Escenario adjunto</h2>
              <p style={{ marginTop: 0 }}><strong>{sharedScenario.name}</strong><br /><span className="ov-meta">{sharedScenario.kind} · guardado {fecha(sharedScenario.createdAt)} · motor {sharedScenario.engineVersion}</span></p>
              <p className="ov-meta ov-mono">Huella de entradas: {sharedScenario.inputsHash.slice(0, 16)}…</p>
              <details className="ove-details"><summary>Resultados</summary><JsonBlock value={sharedScenario.results} /></details>
              <details className="ove-details" style={{ marginTop: 8 }}><summary>Supuestos</summary><JsonBlock value={sharedScenario.assumptions} /></details>
            </article>
          )}
        </aside>
      </div>
    </>
  );
}
