'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zId } from '@/lib/actions';
import { zOptId } from '@/lib/cliente/zod';
import { saveUpload } from '@/lib/domain/documents';
import { ownPerson } from '@/lib/cliente/server';
import { getPrisma } from '@/lib/prisma';

export const uploadDocumentAction = secureAction(
  'doc.upload',
  z.object({
    typeId: zId,
    opportunityId: zOptId,
    file: z.instanceof(File, { message: 'Adjunta un archivo.' }),
  }),
  async (input, { session, meta }) => {
    const doc = await getPrisma().$transaction(
      async (tx) => {
        const person = await ownPerson(session, tx);
        if (input.opportunityId) {
          const opp = await tx.opportunity.findFirst({ where: { id: input.opportunityId, personId: person.id }, select: { id: true } });
          if (!opp) throw new UserError('Caso no encontrado.');
        }
        const type = await tx.documentType.findUnique({ where: { id: input.typeId }, select: { code: true } });
        if (!type) throw new UserError('Tipo de documento inválido.');
        if (type.code === 'SOPORTE_PAGO') throw new UserError('Los soportes de pago se cargan desde Gestiones → Reportar pago.');
        return saveUpload(tx, { file: input.file, personId: person.id, typeId: input.typeId, opportunityId: input.opportunityId ?? null }, { actor: session.user, meta });
      },
      { timeout: 60_000 },
    );
    revalidatePath('/cliente', 'layout');
    return ok(
      doc.status === 'QUARANTINED'
        ? 'Recibimos el archivo. Está en verificación antivirus; cuando termine pasará a revisión.'
        : `Recibimos "${doc.fileName}" (versión ${doc.version}). Un analista lo revisará.`,
    );
  },
);
