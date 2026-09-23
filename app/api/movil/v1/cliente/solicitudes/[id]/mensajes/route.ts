import { replyRequestAction } from '@/app/(plataforma)/cliente/gestiones/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Responde en el hilo de una solicitud propia abierta: { body }. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const requestId = await idParam(ctx);
  await apiSession({ portal: 'cliente', permission: 'request.create' });
  return runAction(replyRequestAction, withFields(await bodyAsForm(request), { requestId }));
});
