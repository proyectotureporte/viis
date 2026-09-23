import { changeRoleAction } from '@/app/(plataforma)/empresa/usuarios/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/usuarios/[id]/rol — Cambia rol interno: { role } (cierra sus sesiones). */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'user.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(changeRoleAction, withFields(await formOf(request), { id }));
});
