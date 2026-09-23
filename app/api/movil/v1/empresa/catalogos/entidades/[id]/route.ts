import { updateEntityAction } from '@/app/(plataforma)/empresa/catalogos/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/catalogos/entidades/[id] — Actualiza entidad: { slaHours, active?: boolean, agreement?: boolean, notes? } (casilla ausente = false). */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'catalog.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(updateEntityAction, withFields(await formOf(request), { id }));
});
