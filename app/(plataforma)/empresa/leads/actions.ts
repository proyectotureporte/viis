'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zId, zText } from '@/lib/actions';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { createCaseFromAdvisor } from '../casos/nuevo/create';
import { personCaseSchema } from '../casos/nuevo/schema';

/** Convierte un lead de la landing en persona + caso (canal WEB) en una sola transacción. */
export const convertLeadAction = secureAction('lead.manage', personCaseSchema.extend({ leadId: zId }), async (input, { session, meta }) => {
  const ctx = { actor: session.user, meta };
  const created = await getPrisma().$transaction(async (tx) => {
    // Bloqueo optimista: solo un asesor puede convertir el lead.
    const claimed = await tx.contactRequest.updateMany({ where: { id: input.leadId, status: 'NEW' }, data: { status: 'CONVERTED' } });
    if (claimed.count === 0) throw new UserError('Este lead ya fue gestionado por otra persona. Recarga la página.');
    const result = await createCaseFromAdvisor(tx, input, ctx, 'WEB');
    await tx.contactRequest.update({ where: { id: input.leadId }, data: { opportunityId: result.id } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'lead.converted', entity: 'ContactRequest', entityId: input.leadId, before: { status: 'NEW' }, after: { status: 'CONVERTED', opportunityId: result.id, code: result.code, personCreated: result.personCreated }, ipHash: meta.ipHash }, tx);
    return result;
  });
  revalidatePath('/empresa/leads');
  revalidatePath('/empresa/bandeja');
  return ok(`Lead convertido en el caso ${created.code}.`);
});

export const discardLeadAction = secureAction(
  'lead.manage',
  z.object({ leadId: zId, reason: zText(300, 5, 'Escribe el motivo del descarte (mínimo 5 caracteres).') }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const claimed = await tx.contactRequest.updateMany({ where: { id: input.leadId, status: 'NEW' }, data: { status: 'DISCARDED' } });
      if (claimed.count === 0) throw new UserError('Este lead ya fue gestionado por otra persona. Recarga la página.');
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'lead.discarded', entity: 'ContactRequest', entityId: input.leadId, before: { status: 'NEW' }, after: { status: 'DISCARDED', reason: input.reason }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath('/empresa/leads');
    return ok('Lead descartado. El motivo quedó en la bitácora.');
  },
);
