import { cancelTaskAction } from '@/app/(plataforma)/aliado/agenda/actions';
import { assertOwnTask } from '@/lib/movil/aliado';
import { apiSession, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cancela una actividad propia pendiente. */
export const POST = handler(async (_request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'case.note' });
  await assertOwnTask(session.user, id);
  return runAction(cancelTaskAction, withFields(new FormData(), { id }));
});
