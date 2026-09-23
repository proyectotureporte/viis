import { closeRuleAction } from '@/app/(plataforma)/empresa/comisiones/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/comisiones/reglas/[id]/cerrar — Cierra la vigencia: { validTo: "YYYY-MM-DD", reason (mín. 5) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'commission.rules' });
  const id = await routeId(ctx, 'id');
  return runAction(closeRuleAction, withFields(await formOf(request), { ruleId: id }));
});
