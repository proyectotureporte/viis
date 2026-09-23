import { solicitud } from '@/lib/movil/empresa/colas';
import { routeId, type RouteCtx } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/solicitudes/{id} — Detalle con conversación, notas internas y escenario adjunto. */
export const GET = handler(async (_request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'request.manage' });
  return json(await solicitud(session, await routeId(ctx)));
});
