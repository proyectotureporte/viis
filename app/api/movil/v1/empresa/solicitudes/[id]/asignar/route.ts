import { assignRequestAction } from '@/app/(plataforma)/empresa/solicitudes/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/solicitudes/[id]/asignar — Asigna: { assigneeId: uuid | "" }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'request.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(assignRequestAction, withFields(await formOf(request), { requestId: id }));
});
