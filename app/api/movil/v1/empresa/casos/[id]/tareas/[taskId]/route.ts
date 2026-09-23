import { updateTaskAction } from '@/app/(plataforma)/empresa/casos/[id]/actions';
import { type RouteCtx, assertCaseVisible, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/casos/[id]/tareas/[taskId] — Completa o cancela una tarea del caso: { status: "DONE" | "CANCELLED" }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id' | 'taskId'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'case.note' });
  const id = await routeId(ctx, 'id');
  const taskId = await routeId(ctx, 'taskId');
  await assertCaseVisible(session, id);
  return runAction(updateTaskAction, withFields(await formOf(request), { opportunityId: id, taskId }));
});
