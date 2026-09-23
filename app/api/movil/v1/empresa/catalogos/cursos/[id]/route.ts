import { updateCourseAction } from '@/app/(plataforma)/empresa/catalogos/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/catalogos/cursos/[id] — Configura curso: { validityDays, passScore, active?, critical?, mandatory? }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'catalog.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(updateCourseAction, withFields(await formOf(request), { id }));
});
