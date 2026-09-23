import { acceptOfferAction } from '@/app/(plataforma)/empresa/casos/[id]/actions';
import { type RouteCtx, assertCaseVisible, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/casos/[id]/ofertas/[offerId]/aceptar — Registra la aceptación con evidencia: { channel: PRESENCIAL|LLAMADA|VIDEOLLAMADA|CORREO|WHATSAPP, declaration (mín. 10) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id' | 'offerId'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'offer.manage' });
  const id = await routeId(ctx, 'id');
  const offerId = await routeId(ctx, 'offerId');
  await assertCaseVisible(session, id);
  return runAction(acceptOfferAction, withFields(await formOf(request), { opportunityId: id, offerId }));
});
