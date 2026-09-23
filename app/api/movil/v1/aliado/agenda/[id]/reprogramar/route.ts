import { rescheduleTaskAction } from '@/app/(plataforma)/aliado/agenda/actions';
import { assertOwnTask } from '@/lib/movil/aliado';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reprograma una actividad propia pendiente: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'case.note' });
  await assertOwnTask(session.user, id);
  return runAction(rescheduleTaskAction, withFields(await bodyAsForm(request), { id }));
});
