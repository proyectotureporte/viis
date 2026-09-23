'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, zId, zOptText } from '@/lib/actions';
import { decideDocument, takeDocument } from '@/lib/empresa/documents';
import { getPrisma } from '@/lib/prisma';

async function revalidateDoc(documentId: string) {
  revalidatePath('/empresa/documentos');
  const doc = await getPrisma().document.findUnique({ where: { id: documentId }, select: { opportunityId: true, personId: true } });
  if (doc?.opportunityId) revalidatePath(`/empresa/casos/${doc.opportunityId}`);
  if (doc) revalidatePath(`/empresa/clientes/${doc.personId}`);
}

export const takeDocumentAction = secureAction('doc.review', z.object({ documentId: zId }), async (input, { session, meta }) => {
  await getPrisma().$transaction((tx) => takeDocument(tx, input.documentId, { actor: session.user, meta }));
  await revalidateDoc(input.documentId);
  return ok('Documento tomado en revisión.');
});

export const decideDocumentAction = secureAction(
  'doc.review',
  z.object({ documentId: zId, decision: z.enum(['APPROVE', 'REJECT'], { error: 'Decisión inválida.' }), reason: zOptText(500) }),
  async (input, { session, meta }) => {
    const { status } = await getPrisma().$transaction((tx) => decideDocument(tx, input, { actor: session.user, meta }));
    await revalidateDoc(input.documentId);
    return ok(status === 'APPROVED' ? 'Documento aprobado. Avisamos al cliente.' : 'Documento rechazado. El cliente recibió el motivo.');
  },
);
