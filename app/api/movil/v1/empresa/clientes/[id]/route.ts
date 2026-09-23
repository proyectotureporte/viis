import { routeId, type RouteCtx } from '@/lib/movil/empresa/common';
import { clienteFicha } from '@/lib/movil/empresa/personas';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/clientes/{id} — Ficha del cliente (casos filtrados por tu alcance). */
export const GET = handler(async (_request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'person.read' });
  return json(await clienteFicha(session, await routeId(ctx)));
});
