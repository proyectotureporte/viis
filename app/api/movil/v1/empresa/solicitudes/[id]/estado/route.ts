import { changeRequestStatusAction } from '@/app/(plataforma)/empresa/solicitudes/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/solicitudes/[id]/estado — Estado: { status: OPEN | IN_PROGRESS | WAITING_CLIENT }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'request.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(changeRequestStatusAction, withFields(await formOf(request), { requestId: id }));
});
