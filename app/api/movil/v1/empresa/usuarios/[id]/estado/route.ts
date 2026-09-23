import { setActiveAction } from '@/app/(plataforma)/empresa/usuarios/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/usuarios/[id]/estado — Activa/desactiva: { active: "1" | "0", reason? (obligatorio al desactivar) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'user.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(setActiveAction, withFields(await formOf(request), { id }));
});
