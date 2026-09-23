import { acceptOfferAction } from '@/app/(plataforma)/cliente/gestiones/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Acepta una oferta de un caso propio: { confirm: true } (casilla "leí las condiciones"). Guarda la evidencia. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const offerId = await idParam(ctx);
  await apiSession({ portal: 'cliente' });
  return runAction(acceptOfferAction, withFields(await bodyAsForm(request), { offerId }));
});
