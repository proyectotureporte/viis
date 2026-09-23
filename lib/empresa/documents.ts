import type { Prisma } from '@/app/generated/prisma/client';
import { UserError } from '@/lib/actions';
import { notify } from '@/lib/jobs';
import { audit } from '@/lib/security/audit';
import type { ActionCtx } from './access';
import { addDaysYmd, dbDate, todayBogota } from './params';

type Tx = Prisma.TransactionClient;

/** Marca un documento como "en revisión" por el analista actual. */
export async function takeDocument(tx: Tx, documentId: string, ctx: ActionCtx): Promise<void> {
  const doc = await tx.document.findUnique({ where: { id: documentId }, select: { id: true, status: true, reviewedById: true } });
  if (!doc) throw new UserError('El documento no existe.');
  if (doc.status !== 'UPLOADED' && doc.status !== 'IN_REVIEW') throw new UserError('Este documento ya no está pendiente de revisión.');
  await tx.document.update({ where: { id: doc.id }, data: { status: 'IN_REVIEW', reviewedById: ctx.actor.id } });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'document.review_started', entity: 'Document', entityId: doc.id, before: { status: doc.status, reviewedById: doc.reviewedById }, after: { status: 'IN_REVIEW', reviewedById: ctx.actor.id }, ipHash: ctx.meta.ipHash }, tx);
}

/**
 * Decisión sobre un documento (P0 "Como analista valido documentos"):
 * aprobar fija el vencimiento = hoy + vigencia del tipo; rechazar exige motivo.
 * Queda auditado y se notifica al cliente y al aliado del caso.
 */
export async function decideDocument(
  tx: Tx,
  input: { documentId: string; decision: 'APPROVE' | 'REJECT'; reason?: string },
  ctx: ActionCtx,
): Promise<{ status: 'APPROVED' | 'REJECTED' }> {
  const doc = await tx.document.findUnique({
    where: { id: input.documentId },
    include: {
      type: true,
      person: { include: { user: { select: { id: true, email: true, active: true } } } },
      opportunity: { select: { id: true, code: true, allyUserId: true } },
    },
  });
  if (!doc) throw new UserError('El documento no existe.');
  if (doc.status === 'QUARANTINED') throw new UserError('El documento está en verificación antivirus; no se puede revisar todavía.');
  if (doc.status !== 'UPLOADED' && doc.status !== 'IN_REVIEW') throw new UserError('Este documento ya fue revisado.');
  const reason = input.reason?.trim();
  if (input.decision === 'REJECT' && (!reason || reason.length < 5)) {
    throw new UserError('Escribe el motivo del rechazo (mínimo 5 caracteres) para que el cliente sepa qué corregir.');
  }

  const now = new Date();
  const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const expiresAt = status === 'APPROVED' && doc.type.validityDays ? dbDate(addDaysYmd(todayBogota(now), doc.type.validityDays)) : null;
  await tx.document.update({
    where: { id: doc.id },
    data: {
      status,
      reviewedById: ctx.actor.id,
      reviewedAt: now,
      rejectReason: status === 'REJECTED' ? reason!.slice(0, 500) : null,
      expiresAt,
    },
  });
  await audit({
    actorId: ctx.actor.id,
    actorRole: ctx.actor.role,
    action: status === 'APPROVED' ? 'document.approved' : 'document.rejected',
    entity: 'Document',
    entityId: doc.id,
    before: { status: doc.status },
    after: { status, type: doc.type.code, version: doc.version, reason: status === 'REJECTED' ? reason : undefined, expiresAt: expiresAt?.toISOString().slice(0, 10) },
    ipHash: ctx.meta.ipHash,
  }, tx);

  const title = status === 'APPROVED' ? `Documento aprobado: ${doc.type.name}` : `Debes corregir un documento: ${doc.type.name}`;
  const body = status === 'APPROVED'
    ? `Revisamos tu ${doc.type.name.toLowerCase()} (versión ${doc.version}) y quedó aprobado.${expiresAt ? ` Tiene vigencia hasta el ${expiresAt.toISOString().slice(0, 10)}.` : ''}`
    : `No pudimos aprobar tu ${doc.type.name.toLowerCase()} (versión ${doc.version}). Motivo: ${reason}. Carga una nueva versión desde Documentos.`;
  if (doc.person.user?.active) {
    await notify({ userId: doc.person.user.id, title, body, href: '/cliente/documentos', email: status === 'REJECTED' ? { to: doc.person.user.email, ctaLabel: 'Cargar de nuevo' } : undefined }, tx);
  }
  if (doc.opportunity?.allyUserId && doc.opportunity.allyUserId !== ctx.actor.id) {
    await notify({
      userId: doc.opportunity.allyUserId,
      title: `${doc.opportunity.code} · ${status === 'APPROVED' ? 'documento aprobado' : 'documento rechazado'}`,
      body: `${doc.person.firstName} ${doc.person.lastName}: ${doc.type.name}${status === 'REJECTED' ? ` · Motivo: ${reason}` : ''}`,
      href: `/aliado/clientes/${doc.opportunity.id}`,
    }, tx);
  }
  return { status };
}
