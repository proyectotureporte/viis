'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, UserError, zDate, zId, zOptText, zText } from '@/lib/actions';
import { allyAction, scopedCase } from '@/lib/aliado/scope';
import { parseBogota } from '@/lib/aliado/time';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import type { SessionUser } from '@/lib/security/session';
import type { Prisma } from '@/app/generated/prisma/client';

const KINDS = ['TAREA', 'CITA', 'LLAMADA'] as const;
const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida.');
const zOptId = z
  .string()
  .optional()
  .transform((v) => v || undefined)
  .pipe(zId.optional());

function when(date: string, time: string): Date {
  const at = parseBogota(date, time);
  const min = Date.now() - 366 * 86_400_000;
  const max = Date.now() + 2 * 366 * 86_400_000;
  if (at.getTime() < min || at.getTime() > max) throw new UserError('Elige una fecha dentro de los próximos dos años.');
  return at;
}

async function ownTask(tx: Prisma.TransactionClient, user: SessionUser, id: string) {
  const task = await tx.task.findFirst({ where: { id, assigneeId: user.id } });
  if (!task) throw new UserError('No encontramos esa actividad en tu agenda.');
  return task;
}

function refresh(opportunityId?: string | null) {
  revalidatePath('/aliado/agenda');
  revalidatePath('/aliado');
  if (opportunityId) revalidatePath(`/aliado/clientes/${opportunityId}`);
}

export const createTaskAction = allyAction(
  'case.note',
  z.object({
    kind: z.enum(KINDS, 'Elige el tipo de actividad.'),
    title: zText(200, 3, 'Escribe un título.'),
    date: zDate,
    time: zTime,
    detail: zOptText(2000),
    opportunityId: zOptId,
  }),
  async (input, { session, meta }) => {
    const dueAt = when(input.date, input.time);
    const task = await getPrisma().$transaction(async (tx) => {
      if (input.opportunityId) await scopedCase(tx, session.user, input.opportunityId);
      const created = await tx.task.create({
        data: {
          kind: input.kind,
          title: input.title,
          detail: input.detail ?? null,
          dueAt,
          opportunityId: input.opportunityId ?? null,
          assigneeId: session.user.id,
          createdById: session.user.id,
        },
      });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'task.created', entity: 'Task', entityId: created.id, after: { kind: input.kind, dueAt, opportunityId: input.opportunityId ?? null }, ipHash: meta.ipHash }, tx);
      return created;
    });
    refresh(task.opportunityId);
    return ok(`Agendado: ${fechaHora(dueAt)}`);
  },
);

export const completeTaskAction = allyAction('case.note', z.object({ id: zId }), async ({ id }, { session, meta }) => {
  const task = await getPrisma().$transaction(async (tx) => {
    const task = await ownTask(tx, session.user, id);
    if (task.status !== 'OPEN') throw new UserError('Esta actividad ya estaba cerrada.');
    await tx.task.update({ where: { id }, data: { status: 'DONE', doneAt: new Date() } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'task.completed', entity: 'Task', entityId: id, before: { status: task.status }, after: { status: 'DONE' }, ipHash: meta.ipHash }, tx);
    return task;
  });
  refresh(task.opportunityId);
  return ok('Hecho.');
});

export const rescheduleTaskAction = allyAction(
  'case.note',
  z.object({ id: zId, date: zDate, time: zTime }),
  async (input, { session, meta }) => {
    const dueAt = when(input.date, input.time);
    const task = await getPrisma().$transaction(async (tx) => {
      const task = await ownTask(tx, session.user, input.id);
      if (task.status !== 'OPEN') throw new UserError('Solo puedes reprogramar actividades pendientes.');
      await tx.task.update({ where: { id: task.id }, data: { dueAt } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'task.rescheduled', entity: 'Task', entityId: task.id, before: { dueAt: task.dueAt }, after: { dueAt }, ipHash: meta.ipHash }, tx);
      return task;
    });
    refresh(task.opportunityId);
    return ok(`Reprogramada: ${fechaHora(dueAt)}`);
  },
);

export const cancelTaskAction = allyAction('case.note', z.object({ id: zId }), async ({ id }, { session, meta }) => {
  const task = await getPrisma().$transaction(async (tx) => {
    const task = await ownTask(tx, session.user, id);
    if (task.status !== 'OPEN') throw new UserError('Esta actividad ya estaba cerrada.');
    await tx.task.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'task.cancelled', entity: 'Task', entityId: id, before: { status: task.status }, after: { status: 'CANCELLED' }, ipHash: meta.ipHash }, tx);
    return task;
  });
  refresh(task.opportunityId);
  return ok('Actividad cancelada.');
});
