import { discardLeadAction } from '@/app/(plataforma)/empresa/leads/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/leads/[id]/descartar — Descarta el lead: { reason (5–300) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'lead.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(discardLeadAction, withFields(await formOf(request), { leadId: id }));
});
