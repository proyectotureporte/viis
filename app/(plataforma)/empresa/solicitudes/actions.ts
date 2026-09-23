'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import { ok, secureAction, UserError, zCheckbox, zId, zText } from '@/lib/actions';
import { assertActiveStaff } from '@/lib/empresa/access';
import { notify } from '@/lib/jobs';
import { REQUEST_STATUS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import type { SessionUser } from '@/lib/security/session';

type Tx = Prisma.TransactionClient;
const CLOSED = ['RESOLVED', 'REJECTED'];

async function loadOpen(tx: Tx, id: string, allowClosed = false) {
  const request = await tx.serviceRequest.findUnique({
    where: { id },
    include: { person: { select: { firstName: true, user: { select: { id: true, email: true, active: true } } } } },
  });
  if (!request) throw new UserError('La solicitud no existe.');
  if (!allowClosed && CLOSED.includes(request.status)) throw new UserError('La solicitud ya está cerrada.');
  return request;
}

function refresh(id: string) {
  revalidatePath('/empresa/solicitudes');
  revalidatePath(`/empresa/solicitudes/${id}`);
}

function auditReq(tx: Tx, actor: SessionUser, ipHash: string | undefined, action: string, id: string, before: unknown, after: unknown) {
  return audit({ actorId: actor.id, actorRole: actor.role, action, entity: 'ServiceRequest', entityId: id, before, after, ipHash }, tx);
}

export const takeRequestAction = secureAction('request.manage', z.object({ requestId: zId }), async (input, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    const r = await loadOpen(tx, input.requestId);
    const status = r.status === 'OPEN' ? 'IN_PROGRESS' : r.status;
    await tx.serviceRequest.update({ where: { id: r.id }, data: { assigneeId: session.user.id, status } });
    await auditReq(tx, session.user, meta.ipHash, 'request.taken', r.id, { assigneeId: r.assigneeId, status: r.status }, { assigneeId: session.user.id, status });
  });
  refresh(input.requestId);
  return ok('Tomaste la solicitud.');
});

export const assignRequestAction = secureAction(
  'request.manage',
  z.object({ requestId: zId, assigneeId: z.union([zId, z.literal('')]) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const r = await loadOpen(tx, input.requestId);
      const assigneeId = input.assigneeId || null;
      if (assigneeId === r.assigneeId) return;
      const assignee = assigneeId ? await assertActiveStaff(assigneeId, tx) : null;
      await tx.serviceRequest.update({ where: { id: r.id }, data: { assigneeId } });
      await auditReq(tx, session.user, meta.ipHash, 'request.assigned', r.id, { assigneeId: r.assigneeId }, { assigneeId });
      if (assignee && assignee.id !== session.user.id) {
        await notify({ userId: assignee.id, title: `Te asignaron la solicitud ${r.code}`, body: `${r.subject}. Asignada por ${session.user.name}.`, href: `/empresa/solicitudes/${r.id}` }, tx);
      }
    });
    refresh(input.requestId);
    return ok(input.assigneeId ? 'Responsable actualizado.' : 'La solicitud quedó sin responsable.');
  },
);

export const changeRequestStatusAction = secureAction(
  'request.manage',
  z.object({ requestId: zId, status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'], { error: 'Estado inválido.' }) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const r = await loadOpen(tx, input.requestId);
      if (r.status === input.status) return;
      await tx.serviceRequest.update({ where: { id: r.id }, data: { status: input.status } });
      await auditReq(tx, session.user, meta.ipHash, 'request.status_changed', r.id, { status: r.status }, { status: input.status });
      if (input.status === 'WAITING_CLIENT' && r.person.user?.active) {
        await notify({ userId: r.person.user.id, title: `Tu solicitud ${r.code} espera tu respuesta`, body: `Necesitamos información tuya para continuar con "${r.subject}". Revisa los mensajes en Gestiones.`, href: '/cliente/gestiones', email: { to: r.person.user.email, ctaLabel: 'Responder' } }, tx);
      }
    });
    refresh(input.requestId);
    return ok(`Estado: ${REQUEST_STATUS[input.status].label}.`);
  },
);

export const messageRequestAction = secureAction(
  'request.manage',
  z.object({ requestId: zId, body: zText(4000, 2, 'Escribe el mensaje.'), internal: zCheckbox }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const r = await loadOpen(tx, input.requestId, input.internal);
      const message = await tx.requestMessage.create({ data: { requestId: r.id, byUserId: session.user.id, body: input.body, internal: input.internal } });
      await auditReq(tx, session.user, meta.ipHash, input.internal ? 'request.internal_note' : 'request.replied', r.id, null, { messageId: message.id, internal: input.internal, length: input.body.length });
      if (!input.internal) {
        if (r.status === 'OPEN') await tx.serviceRequest.update({ where: { id: r.id }, data: { status: 'IN_PROGRESS', assigneeId: r.assigneeId ?? session.user.id } });
        if (r.person.user?.active) {
          await notify({ userId: r.person.user.id, title: `Respuesta a tu solicitud ${r.code}`, body: input.body.length > 600 ? `${input.body.slice(0, 600)}…` : input.body, href: '/cliente/gestiones', email: { to: r.person.user.email, ctaLabel: 'Ver la solicitud' } }, tx);
        }
      }
    });
    refresh(input.requestId);
    return ok(input.internal ? 'Nota interna guardada (el cliente no la ve).' : 'Respuesta enviada al cliente por la app y por correo.');
  },
);

export const closeRequestAction = secureAction(
  'request.manage',
  z.object({
    requestId: zId,
    outcome: z.enum(['RESOLVED', 'REJECTED'], { error: 'Elige el resultado.' }),
    resolution: zText(4000, 10, 'Escribe la resolución para el cliente (mínimo 10 caracteres).'),
  }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const r = await loadOpen(tx, input.requestId);
      await tx.serviceRequest.update({ where: { id: r.id }, data: { status: input.outcome, resolution: input.resolution, assigneeId: r.assigneeId ?? session.user.id } });
      await tx.requestMessage.create({ data: { requestId: r.id, byUserId: session.user.id, body: input.resolution, internal: false } });
      await auditReq(tx, session.user, meta.ipHash, input.outcome === 'RESOLVED' ? 'request.resolved' : 'request.rejected', r.id, { status: r.status }, { status: input.outcome, resolution: input.resolution, withinSla: Date.now() <= r.slaDueAt.getTime() });
      if (r.person.user?.active) {
        await notify({
          userId: r.person.user.id,
          title: input.outcome === 'RESOLVED' ? `Resolvimos tu solicitud ${r.code}` : `Tu solicitud ${r.code} no fue procedente`,
          body: input.resolution,
          href: '/cliente/gestiones',
          email: { to: r.person.user.email, ctaLabel: 'Ver detalle' },
        }, tx);
      }
    });
    refresh(input.requestId);
    return ok(input.outcome === 'RESOLVED' ? 'Solicitud resuelta. Avisamos al cliente.' : 'Solicitud cerrada como no procedente. Avisamos al cliente.');
  },
);
