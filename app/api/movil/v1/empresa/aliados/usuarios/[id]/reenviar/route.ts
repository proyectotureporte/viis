import { resendAllyInviteAction } from '@/app/(plataforma)/empresa/aliados/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/aliados/usuarios/[id]/reenviar — Reenvía la invitación (invalida la anterior). Sin cuerpo. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'ally.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(resendAllyInviteAction, withFields(await formOf(request), { userId: id }));
});
