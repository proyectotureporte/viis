import { reconcilePaymentAction } from '@/app/(plataforma)/empresa/pagos/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/pagos/[id]/conciliar — Concilia un pago validado: { reference (3–300) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'payment.review' });
  const id = await routeId(ctx, 'id');
  return runAction(reconcilePaymentAction, withFields(await formOf(request), { id }));
});
