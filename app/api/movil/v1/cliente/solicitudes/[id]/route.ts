import { clientContext, clienteSolicitud } from '@/lib/movil/cliente';
import { handler, json } from '@/lib/movil/http';
import { idParam, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Detalle de una solicitud propia con su hilo (sin mensajes internos del equipo). */
export const GET = handler(async (_request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const { session, person } = await clientContext();
  return json(await clienteSolicitud(session, person, id));
});
