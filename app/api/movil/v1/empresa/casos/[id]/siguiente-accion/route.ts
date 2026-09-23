import { nextActionAction } from '@/app/(plataforma)/empresa/casos/[id]/actions';
import { type RouteCtx, assertCaseVisible, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/casos/[id]/siguiente-accion — Siguiente acción: { nextAction (3–240) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'case.note' });
  const id = await routeId(ctx, 'id');
  await assertCaseVisible(session, id);
  return runAction(nextActionAction, withFields(await formOf(request), { opportunityId: id }));
});
