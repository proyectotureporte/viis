import { aliadoFicha } from '@/lib/movil/aliado';
import { apiSession, handler, json } from '@/lib/movil/http';
import { idParam, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ficha 360 del caso (solo dentro del alcance del aliado; fuera de él responde 404). */
export const GET = handler(async (_request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'case.read' });
  return json(await aliadoFicha(session.user, id));
});
