import { allyStageAction, withdrawAction } from '@/app/(plataforma)/aliado/clientes/actions';
import { assertCaseInScope } from '@/lib/movil/aliado';
import { apiSession, ApiError, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mueve la etapa comercial: { to: 'CONTACTED' | 'PROFILED', note? } o desistimiento { to: 'WITHDRAWN', reason }.
 * Las demás etapas las mueve el equipo OpenV.
 */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const opportunityId = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'case.create' });
  await assertCaseInScope(session.user, opportunityId);
  const form = withFields(await bodyAsForm(request), { opportunityId });
  const to = form.get('to');
  if (to === 'WITHDRAWN') return runAction(withdrawAction, form);
  if (to === 'CONTACTED' || to === 'PROFILED') return runAction(allyStageAction, form);
  throw new ApiError('Etapa no permitida desde el portal aliado.', 400);
});
