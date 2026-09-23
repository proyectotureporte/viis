import { reverseCommissionAction } from '@/app/(plataforma)/empresa/comisiones/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/comisiones/[id]/reversar — Reversa: { reason (5–300) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'commission.approve' });
  const id = await routeId(ctx, 'id');
  return runAction(reverseCommissionAction, withFields(await formOf(request), { id }));
});
