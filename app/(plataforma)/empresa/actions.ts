'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zId } from '@/lib/actions';
import { assertCaseInScope } from '@/lib/empresa/access';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { can } from '@/lib/security/rbac';

/** Cierra una tarea propia desde "Mis tareas" (o cualquiera si coordina casos). */
export const closeMyTaskAction = secureAction(
  'case.note',
  z.object({ id: zId, status: z.enum(['DONE', 'CANCELLED']) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: input.id } });
      if (!task || task.status !== 'OPEN') throw new UserError('La tarea ya no está abierta.');
      if (task.assigneeId !== session.user.id && !can(session.user.role, 'case.assign')) throw new UserError('Solo el responsable puede cerrar esta tarea.');
      if (task.opportunityId) await assertCaseInScope(session, task.opportunityId, tx);
      await tx.task.update({ where: { id: task.id }, data: { status: input.status, doneAt: new Date() } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: input.status === 'DONE' ? 'task.done' : 'task.cancelled', entity: 'Task', entityId: task.id, before: { status: task.status }, after: { status: input.status, opportunityId: task.opportunityId }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath('/empresa');
    return ok(input.status === 'DONE' ? 'Tarea completada.' : 'Tarea cancelada.');
  },
);
