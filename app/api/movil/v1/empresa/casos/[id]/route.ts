import { caso } from '@/lib/movil/empresa/caso';
import { routeId, type RouteCtx } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/casos/{id} — Expediente 360 del caso (404 si no existe o está fuera de tu alcance). */
export const GET = handler(async (_request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'case.read' });
  return json(await caso(session, await routeId(ctx)));
});
