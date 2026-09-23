import { inviteAllyUserAction } from '@/app/(plataforma)/empresa/aliados/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/aliados/[id]/invitar — Invita usuario: { name, email, role: ALLY | ALLY_ADMIN }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'ally.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(inviteAllyUserAction, withFields(await formOf(request), { organizationId: id }));
});
