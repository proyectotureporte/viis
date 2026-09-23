import { takePaymentAction } from '@/app/(plataforma)/empresa/pagos/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/pagos/[id]/tomar — Toma el pago en revisión. Sin cuerpo. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'payment.review' });
  const id = await routeId(ctx, 'id');
  return runAction(takePaymentAction, withFields(await formOf(request), { id }));
});
