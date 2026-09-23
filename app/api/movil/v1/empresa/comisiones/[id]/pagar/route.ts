import { payCommissionAction } from '@/app/(plataforma)/empresa/comisiones/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/comisiones/[id]/pagar — Marca pagada: { paymentRef (3–120) }. Solo Tesorería/Administración. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'commission.pay' });
  const id = await routeId(ctx, 'id');
  return runAction(payCommissionAction, withFields(await formOf(request), { id }));
});
