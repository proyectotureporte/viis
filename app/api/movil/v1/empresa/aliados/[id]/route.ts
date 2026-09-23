import { updateAllyAction } from '@/app/(plataforma)/empresa/aliados/actions';
import { formOf, routeId, withFields, type RouteCtx } from '@/lib/movil/empresa/common';
import { aliado } from '@/lib/movil/empresa/red';
import { apiSession, handler, json, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/aliados/{id} — Ficha: desempeño, usuarios, certificaciones y casos recientes. */
export const GET = handler(async (_request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'ally.manage' });
  return json(await aliado(await routeId(ctx)));
});

/** POST /api/movil/v1/empresa/aliados/{id} — Edita la organización (mismos campos que el alta; active ausente = inactivar). */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'ally.manage' });
  const id = await routeId(ctx);
  return runAction(updateAllyAction, withFields(await formOf(request), { id }));
});
