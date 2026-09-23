'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import { ok, secureAction, UserError, zId, zText } from '@/lib/actions';
import { applyValidatedPayment } from '@/lib/empresa/payments';
import { notify } from '@/lib/jobs';
import { money } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

const PENDING = ['REPORTED', 'IN_REVIEW'] as const;

function kindText(kind: string): string {
  return kind === 'INSTALLMENT' ? 'cuota' : 'abono';
}

async function loadPayment(tx: Prisma.TransactionClient, id: string) {
  const payment = await tx.paymentReport.findUnique({
    where: { id },
    include: { loan: { include: { person: { include: { user: { select: { id: true, email: true, active: true } } } } } } },
  });
  if (!payment) throw new UserError('El pago reportado no existe.');
  return payment;
}

export const takePaymentAction = secureAction('payment.review', z.object({ id: zId }), async ({ id }, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    const payment = await loadPayment(tx, id);
    const res = await tx.paymentReport.updateMany({ where: { id, status: { in: [...PENDING] } }, data: { status: 'IN_REVIEW', reviewedById: session.user.id } });
    if (res.count !== 1) throw new UserError('Este pago ya no está pendiente de revisión.');
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'payment.review_started', entity: 'PaymentReport', entityId: id, before: { status: payment.status, reviewedById: payment.reviewedById }, after: { status: 'IN_REVIEW', reviewedById: session.user.id }, ipHash: meta.ipHash }, tx);
  });
  revalidatePath('/empresa/pagos');
  return ok('Tomaste el pago en revisión.');
});

export const validatePaymentAction = secureAction('payment.review', z.object({ id: zId }), async ({ id }, { session, meta }) => {
  const ctx = { actor: session.user, meta };
  const summary = await getPrisma().$transaction(async (tx) => {
    const payment = await loadPayment(tx, id);
    const now = new Date();
    const res = await tx.paymentReport.updateMany({ where: { id, status: { in: [...PENDING] } }, data: { status: 'VALIDATED', reviewedById: session.user.id, reviewedAt: now, rejectReason: null } });
    if (res.count !== 1) throw new UserError('Este pago ya no está pendiente de revisión.');
    const result = await applyValidatedPayment(tx, id, ctx);
    if (payment.documentId) {
      const doc = await tx.document.findUnique({ where: { id: payment.documentId }, select: { id: true, status: true } });
      if (doc && (doc.status === 'UPLOADED' || doc.status === 'IN_REVIEW')) {
        await tx.document.update({ where: { id: doc.id }, data: { status: 'APPROVED', reviewedById: session.user.id, reviewedAt: now } });
        await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'document.approved', entity: 'Document', entityId: doc.id, before: { status: doc.status }, after: { status: 'APPROVED', reason: 'Soporte de pago validado' }, ipHash: meta.ipHash }, tx);
      }
    }
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'payment.validated', entity: 'PaymentReport', entityId: id, before: { status: payment.status }, after: { status: 'VALIDATED', loanId: payment.loanId, kind: payment.kind, amount: payment.amount, summary: result }, ipHash: meta.ipHash }, tx);
    const user = payment.loan.person.user;
    if (user?.active) {
      await notify({
        userId: user.id,
        title: `Validamos tu ${kindText(payment.kind)} de ${money(payment.amount)}`,
        body: `El pago del ${payment.paidOn.toISOString().slice(0, 10)} a tu crédito ${payment.loan.alias} quedó validado y actualizamos tu crédito. ${result}`,
        href: '/cliente/credito',
        email: { to: user.email, ctaLabel: 'Ver mi crédito' },
      }, tx);
    }
    return result;
  });
  revalidatePath('/empresa/pagos');
  return ok(`Pago validado. ${summary}`);
});

export const rejectPaymentAction = secureAction(
  'payment.review',
  z.object({ id: zId, reason: zText(500, 5, 'Escribe el motivo del rechazo (mínimo 5 caracteres).') }),
  async ({ id, reason }, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const payment = await loadPayment(tx, id);
      const res = await tx.paymentReport.updateMany({ where: { id, status: { in: [...PENDING] } }, data: { status: 'REJECTED', rejectReason: reason, reviewedById: session.user.id, reviewedAt: new Date() } });
      if (res.count !== 1) throw new UserError('Este pago ya no está pendiente de revisión.');
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'payment.rejected', entity: 'PaymentReport', entityId: id, before: { status: payment.status }, after: { status: 'REJECTED', reason }, ipHash: meta.ipHash }, tx);
      const user = payment.loan.person.user;
      if (user?.active) {
        await notify({
          userId: user.id,
          title: `No pudimos validar tu ${kindText(payment.kind)} de ${money(payment.amount)}`,
          body: `Motivo: ${reason}. Tu crédito no cambió. Si pagaste, vuelve a reportarlo con un soporte legible o escríbenos desde Gestiones.`,
          href: '/cliente/credito',
          email: { to: user.email, ctaLabel: 'Revisar mi pago' },
        }, tx);
      }
    });
    revalidatePath('/empresa/pagos');
    return ok('Pago rechazado. Le avisamos al cliente con el motivo.');
  },
);

export const reconcilePaymentAction = secureAction(
  'payment.review',
  z.object({ id: zId, reference: zText(300, 3, 'Indica la referencia del extracto o la observación de conciliación.') }),
  async ({ id, reference }, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const payment = await loadPayment(tx, id);
      const res = await tx.paymentReport.updateMany({ where: { id, status: 'VALIDATED' }, data: { status: 'RECONCILED' } });
      if (res.count !== 1) throw new UserError('Solo se concilian pagos validados.');
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'payment.reconciled', entity: 'PaymentReport', entityId: id, before: { status: 'VALIDATED' }, after: { status: 'RECONCILED', reference }, ipHash: meta.ipHash }, tx);
      const user = payment.loan.person.user;
      if (user?.active) {
        await notify({
          userId: user.id,
          title: `Tu ${kindText(payment.kind)} de ${money(payment.amount)} quedó conciliado`,
          body: `Confirmamos el pago del ${payment.paidOn.toISOString().slice(0, 10)} contra el extracto de tu entidad.`,
          href: '/cliente/credito',
        }, tx);
      }
    });
    revalidatePath('/empresa/pagos');
    return ok('Pago conciliado.');
  },
);
