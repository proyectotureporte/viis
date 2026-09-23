import { renameScenarioAction } from '@/app/(plataforma)/cliente/decidir/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Renombra un escenario propio: { name }. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  await apiSession({ portal: 'cliente' });
  return runAction(renameScenarioAction, withFields(await bodyAsForm(request), { id }));
});
