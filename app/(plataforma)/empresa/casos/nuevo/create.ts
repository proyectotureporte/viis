import type { Prisma } from '@/app/generated/prisma/client';
import { UserError } from '@/lib/actions';
import { CONSENT_VERSION } from '@/lib/consent';
import { createOpportunity, findOrCreatePerson } from '@/lib/domain/cases';
import { type ActionCtx, assertActiveStaff } from '@/lib/empresa/access';
import { audit } from '@/lib/security/audit';
import { can } from '@/lib/security/rbac';
import { CAPTURE_CHANNELS, type PersonCaseInput } from './schema';

type Tx = Prisma.TransactionClient;

export const ADVISOR_DECLARATION =
  'Declaro que leí al cliente el texto de cada autorización marcada, que la otorgó de forma previa, expresa e informada por el canal indicado, y que la información registrada corresponde a lo que el cliente declaró.';

/**
 * Alta por asesor: persona sin aliado (deduplicada por índice ciego) + caso.
 * El asesor queda como responsable si no se elige otro; un ADVISOR solo puede
 * asignarse a sí mismo (o dejarlo sin asignar no aplica: se asigna a él).
 */
export async function createCaseFromAdvisor(
  tx: Tx,
  input: PersonCaseInput,
  ctx: ActionCtx,
  channel: 'DIRECTO' | 'WEB',
): Promise<{ id: string; code: string; personId: string; personCreated: boolean }> {
  if (!can(ctx.actor.role, 'person.create')) throw new UserError('No tienes permiso para registrar personas.');
  let assigneeId: string | null = input.assigneeId ?? null;
  if (ctx.actor.role === 'ADVISOR') assigneeId = ctx.actor.id;
  else if (assigneeId) await assertActiveStaff(assigneeId, tx);
  if (input.entityId) {
    const entity = await tx.entity.findFirst({ where: { id: input.entityId, active: true }, select: { id: true } });
    if (!entity) throw new UserError('La entidad elegida no está activa.');
  }

  const { personId, created } = await findOrCreatePerson(
    tx,
    {
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      city: input.city,
      monthlyIncome: input.monthlyIncome,
    },
    { actor: ctx.actor, allyOrgId: null, consents: input.consents, meta: ctx.meta },
  );
  await audit({
    actorId: ctx.actor.id,
    actorRole: ctx.actor.role,
    action: 'consent.captured_by_advisor',
    entity: 'Person',
    entityId: personId,
    after: { purposes: input.consents, textVersion: CONSENT_VERSION, captureChannel: input.captureChannel, captureChannelLabel: CAPTURE_CHANNELS[input.captureChannel], declaration: ADVISOR_DECLARATION, personCreated: created },
    ipHash: ctx.meta.ipHash,
  }, tx);
  const opportunity = await createOpportunity(
    tx,
    { personId, product: input.product, amount: input.amount, channel, assigneeId, entityId: input.entityId ?? null, nextAction: input.nextAction },
    ctx,
  );
  return { ...opportunity, personId, personCreated: created };
}
