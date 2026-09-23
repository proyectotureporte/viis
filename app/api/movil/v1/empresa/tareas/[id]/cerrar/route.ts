import { closeMyTaskAction } from '@/app/(plataforma)/empresa/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/tareas/[id]/cerrar — Cierra una tarea propia de "Mis tareas": { status: "DONE" | "CANCELLED" } (por defecto DONE). */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'case.note' });
  const id = await routeId(ctx, 'id');
  const form = withFields(await formOf(request), { id });
  if (!form.get('status')) form.set('status', 'DONE');
  return runAction(closeMyTaskAction, form);
});
