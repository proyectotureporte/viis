import { convertLeadAction } from '@/app/(plataforma)/empresa/leads/actions';
import { formOf, routeId, withFields, type RouteCtx } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/movil/contract-empresa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/movil/v1/empresa/leads/{id}/convertir — Convierte el lead en persona + caso (canal WEB). Mismos campos que
 * POST casos/nuevo. Devuelve `id` del caso creado.
 */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'lead.manage' });
  const leadId = await routeId(ctx);
  const state = await convertLeadAction(null, withFields(await formOf(request), { leadId }));
  const result: ActionResult = state ? { ok: state.ok, message: state.message, at: state.at } : { ok: true, message: 'Listo.' };
  if (result.ok) {
    const lead = await getPrisma().contactRequest.findUnique({ where: { id: leadId }, select: { opportunityId: true } });
    if (lead?.opportunityId) result.id = lead.opportunityId;
  }
  return json(result, result.ok ? 200 : 422);
});
