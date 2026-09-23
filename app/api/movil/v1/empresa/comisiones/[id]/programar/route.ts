import { scheduleCommissionAction } from '@/app/(plataforma)/empresa/comisiones/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/comisiones/[id]/programar — Programa el pago: { payDate: "YYYY-MM-DD" (no pasada) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'commission.approve' });
  const id = await routeId(ctx, 'id');
  return runAction(scheduleCommissionAction, withFields(await formOf(request), { id }));
});
