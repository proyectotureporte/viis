import type { Prisma } from '@/app/generated/prisma/client';
import type { Priority } from '@/app/generated/prisma/enums';
import { UserError } from '@/lib/actions';
import { notify } from '@/lib/jobs';
import { PRIORITY_LABELS } from '@/lib/labels';
import { audit } from '@/lib/security/audit';
import { type ActionCtx, assertActiveStaff } from './access';

type Tx = Prisma.TransactionClient;

/** Asigna (o desasigna con null) el responsable de un caso; notifica al nuevo responsable. */
export async function assignCase(tx: Tx, opportunityId: string, assigneeId: string | null, ctx: ActionCtx): Promise<boolean> {
  const opp = await tx.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true, code: true, assigneeId: true, person: { select: { firstName: true, lastName: true } } } });
  if (!opp) throw new UserError('El caso no existe.');
  if (opp.assigneeId === assigneeId) return false;
  const assignee = assigneeId ? await assertActiveStaff(assigneeId, tx) : null;
  await tx.opportunity.update({ where: { id: opp.id }, data: { assigneeId } });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'case.assigned', entity: 'Opportunity', entityId: opp.id, before: { assigneeId: opp.assigneeId }, after: { assigneeId }, ipHash: ctx.meta.ipHash }, tx);
  if (assignee && assignee.id !== ctx.actor.id) {
    await notify({ userId: assignee.id, title: `Te asignaron el caso ${opp.code}`, body: `${opp.person.firstName} ${opp.person.lastName}. Asignado por ${ctx.actor.name}.`, href: `/empresa/casos/${opp.id}` }, tx);
  }
  return true;
}

const BUMP: Record<Priority, Priority> = { LOW: 'HIGH', NORMAL: 'HIGH', HIGH: 'CRITICAL', CRITICAL: 'CRITICAL' };

/**
 * Escalamiento manual: sube la prioridad, marca el caso como escalado y avisa
 * a coordinación y administración con el motivo.
 */
export async function escalateCase(tx: Tx, opportunityId: string, reason: string, ctx: ActionCtx): Promise<void> {
  const opp = await tx.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true, code: true, priority: true, stage: true, escalatedAt: true } });
  if (!opp) throw new UserError('El caso no existe.');
  if (['WITHDRAWN', 'POSTSALE'].includes(opp.stage)) throw new UserError('Un caso cerrado no se puede escalar.');
  const priority = BUMP[opp.priority];
  await tx.opportunity.update({ where: { id: opp.id }, data: { escalatedAt: new Date(), priority } });
  await tx.interaction.create({ data: { opportunityId: opp.id, channel: 'INTERNO', summary: `Caso escalado: ${reason}`, visibleToClient: false, byUserId: ctx.actor.id } });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'case.escalated', entity: 'Opportunity', entityId: opp.id, before: { priority: opp.priority, escalatedAt: opp.escalatedAt }, after: { priority, reason }, ipHash: ctx.meta.ipHash }, tx);
  const leads = await tx.user.findMany({ where: { role: { in: ['COORDINATOR', 'ADMIN'] }, active: true, id: { not: ctx.actor.id } }, select: { id: true } });
  for (const user of leads) {
    await notify({ userId: user.id, title: `Caso escalado · ${opp.code}`, body: `Prioridad ${PRIORITY_LABELS[priority].label.toLowerCase()}. ${ctx.actor.name}: ${reason}`, href: `/empresa/casos/${opp.id}` }, tx);
  }
}

export async function setPriority(tx: Tx, opportunityId: string, priority: Priority, ctx: ActionCtx): Promise<void> {
  const opp = await tx.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true, priority: true } });
  if (!opp) throw new UserError('El caso no existe.');
  if (opp.priority === priority) return;
  await tx.opportunity.update({ where: { id: opp.id }, data: { priority } });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'case.priority_changed', entity: 'Opportunity', entityId: opp.id, before: { priority: opp.priority }, after: { priority }, ipHash: ctx.meta.ipHash }, tx);
}
