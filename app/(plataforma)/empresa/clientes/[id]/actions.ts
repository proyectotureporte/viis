'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zId, zText } from '@/lib/actions';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { decryptText } from '@/lib/security/crypto';

/** Muestra el documento completo (y el teléfono) solo a quien tiene person.read, y lo deja en la bitácora. */
export const revealDocumentAction = secureAction('person.read', z.object({ personId: zId }), async (input, { session, meta }) => {
  const prisma = getPrisma();
  const person = await prisma.person.findUnique({ where: { id: input.personId }, select: { id: true, documentType: true, documentNumEnc: true, phoneEnc: true } });
  if (!person) throw new UserError('La persona no existe.');
  const number = decryptText(person.documentNumEnc);
  const phone = person.phoneEnc ? decryptText(person.phoneEnc) : null;
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'person.document_viewed', entity: 'Person', entityId: person.id, after: { fields: phone ? ['documentNumber', 'phone'] : ['documentNumber'] }, ipHash: meta.ipHash });
  return ok(`Documento: ${person.documentType} ${number}${phone ? ` · Teléfono: ${phone}` : ''}. Esta consulta quedó registrada en la bitácora.`);
});

const REVOKE_CHANNELS = ['ESCRITO', 'CORREO', 'TELEFONICO', 'PRESENCIAL', 'SOLICITUD_PLATAFORMA'] as const;

export const revokeConsentAction = secureAction(
  'consent.manage',
  z.object({
    personId: zId,
    purpose: z.enum(CONSENT_PURPOSES.map((p) => p.code) as [string, ...string[]], { error: 'Finalidad inválida.' }),
    channel: z.enum(REVOKE_CHANNELS, { error: 'Indica el canal por el que llegó la revocación.' }),
    evidence: zText(1000, 10, 'Describe la evidencia de la revocación (mínimo 10 caracteres): fecha, radicado, correo recibido…'),
  }),
  async (input, { session, meta }) => {
    const count = await getPrisma().$transaction(async (tx) => {
      const active = await tx.consent.findMany({ where: { personId: input.personId, purpose: input.purpose, revokedAt: null }, select: { id: true, textVersion: true } });
      if (!active.length) throw new UserError('No hay una autorización vigente de esa finalidad para revocar.');
      const result = await tx.consent.updateMany({ where: { id: { in: active.map((c) => c.id) } }, data: { revokedAt: new Date(), revokedBy: session.user.id } });
      await audit({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: 'consent.revoked',
        entity: 'Person',
        entityId: input.personId,
        before: { consents: active },
        after: { purpose: input.purpose, channel: input.channel, evidence: input.evidence, registeredBy: 'consola' },
        ipHash: meta.ipHash,
      }, tx);
      return result.count;
    });
    revalidatePath(`/empresa/clientes/${input.personId}`);
    const title = CONSENT_PURPOSES.find((p) => p.code === input.purpose)?.title ?? input.purpose;
    return ok(
      input.purpose === 'TRATAMIENTO'
        ? `Revocación registrada (${count}). Atención: sin autorización de tratamiento no se puede seguir gestionando al cliente; abre una solicitud de habeas data para definir supresión o conservación legal.`
        : `Revocación de "${title}" registrada con su evidencia.`,
    );
  },
);
