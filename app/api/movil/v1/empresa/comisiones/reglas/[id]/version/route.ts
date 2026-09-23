import { versionRuleAction } from '@/app/(plataforma)/empresa/comisiones/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/comisiones/reglas/[id]/version — Nueva versión (cierra la anterior): { percent, withholdingPct, paymentDays, validFrom, validTo?, note? }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'commission.rules' });
  const id = await routeId(ctx, 'id');
  return runAction(versionRuleAction, withFields(await formOf(request), { ruleId: id }));
});
