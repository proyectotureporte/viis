import { createOfferAction } from '@/app/(plataforma)/empresa/casos/[id]/actions';
import { type RouteCtx, assertCaseVisible, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/casos/[id]/ofertas — Registra oferta y la calcula con el motor: { entityName? | entityOther?, rateEa: "12,5" (%), system, termMonths, amount, monthlyInsurance?, upfrontCosts?, validUntil?, source, conditions? }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'offer.manage' });
  const id = await routeId(ctx, 'id');
  await assertCaseVisible(session, id);
  return runAction(createOfferAction, withFields(await formOf(request), { opportunityId: id }));
});
