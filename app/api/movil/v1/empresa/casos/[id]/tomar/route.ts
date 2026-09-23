import { bandejaAction } from '@/app/(plataforma)/empresa/bandeja/actions';
import { type RouteCtx, assertCaseVisible, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/casos/[id]/tomar — Toma un caso sin responsable (queda a tu nombre). Sin cuerpo. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'case.stage' });
  const id = await routeId(ctx, 'id');
  await assertCaseVisible(session, id);
  return runAction(bandejaAction, withFields(await formOf(request), { op: `take:${id}` }));
});
