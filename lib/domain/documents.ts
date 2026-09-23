import type { Prisma } from '@/app/generated/prisma/client';
import { UserError } from '@/lib/actions';
import { audit } from '@/lib/security/audit';
import type { RequestMeta } from '@/lib/security/request';
import type { SessionUser } from '@/lib/security/session';
import { MAX_UPLOAD_BYTES, storeDocument } from '@/lib/storage';

type Tx = Prisma.TransactionClient;

/** Checklist dinámico: tipos requeridos para el producto sin versión aprobada y vigente. */
export async function missingDocuments(tx: Tx, personId: string, product: string) {
  const types = await tx.documentType.findMany({
    where: { active: true, required: true, OR: [{ products: { has: product } }, { products: { isEmpty: true } }] },
    orderBy: { sortOrder: 'asc' },
  });
  if (!types.length) return [];
  const approved = await tx.document.findMany({
    where: {
      personId,
      typeId: { in: types.map((t) => t.id) },
      status: 'APPROVED',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { typeId: true },
  });
  const ok = new Set(approved.map((d) => d.typeId));
  return types.filter((t) => !ok.has(t.id));
}

/** Estado del checklist para mostrar: cada tipo con su última versión. */
export async function checklist(tx: Tx, personId: string, product: string) {
  const types = await tx.documentType.findMany({
    where: { active: true, OR: [{ products: { has: product } }, { products: { isEmpty: true } }] },
    orderBy: { sortOrder: 'asc' },
  });
  const docs = await tx.document.findMany({
    where: { personId, typeId: { in: types.map((t) => t.id) } },
    orderBy: { version: 'desc' },
  });
  return types.map((type) => ({ type, latest: docs.find((d) => d.typeId === type.id) ?? null }));
}

export async function saveUpload(
  tx: Tx,
  input: { file: File; personId: string; typeId: string; opportunityId?: string | null },
  ctx: { actor: SessionUser; meta: RequestMeta },
) {
  if (!(input.file instanceof File) || input.file.size === 0) throw new UserError('Adjunta un archivo.');
  if (input.file.size > MAX_UPLOAD_BYTES) throw new UserError('El archivo supera 10 MB.');
  const type = await tx.documentType.findUnique({ where: { id: input.typeId } });
  if (!type?.active) throw new UserError('Tipo de documento inválido.');
  let stored;
  try {
    stored = await storeDocument(Buffer.from(await input.file.arrayBuffer()));
  } catch (error) {
    throw new UserError(error instanceof Error ? error.message : 'No se pudo guardar el archivo.');
  }
  const last = await tx.document.findFirst({ where: { personId: input.personId, typeId: type.id }, orderBy: { version: 'desc' }, select: { version: true } });
  const duplicate = await tx.document.findFirst({ where: { personId: input.personId, sha256: stored.sha256, status: { not: 'REJECTED' } }, select: { id: true } });
  if (duplicate) throw new UserError('Ese mismo archivo ya fue cargado al expediente.');
  const document = await tx.document.create({
    data: {
      personId: input.personId,
      opportunityId: input.opportunityId ?? null,
      typeId: type.id,
      version: (last?.version ?? 0) + 1,
      status: stored.scan === 'CLEAN' ? 'UPLOADED' : 'QUARANTINED',
      scanResult: stored.scan,
      fileName: input.file.name.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 200) || 'documento',
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      uploadedById: ctx.actor.id,
    },
  });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'document.uploaded', entity: 'Document', entityId: document.id, after: { type: type.code, version: document.version, scan: stored.scan, sha256: stored.sha256 }, ipHash: ctx.meta.ipHash }, tx);
  return document;
}
