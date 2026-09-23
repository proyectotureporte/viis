import { reportPaymentAction } from '@/app/(plataforma)/cliente/gestiones/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reporta un pago con soporte. MULTIPART obligatorio: loanId, kind (INSTALLMENT|PREPAYMENT), applyMode
 * (TERM|PAYMENT, solo abonos), paidOn, amount, channel, reference?, file (PDF/JPG/PNG ≤ 10 MB) y ack=on.
 */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'cliente', permission: 'payment.report' });
  return runAction(reportPaymentAction, await bodyAsForm(request));
});
