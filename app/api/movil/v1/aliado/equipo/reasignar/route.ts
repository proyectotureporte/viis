import { reassignCaseAction } from '@/app/(plataforma)/aliado/equipo/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cuerpo: { opportunityId, allyUserId }. La action verifica que el usuario sea ALLY_ADMIN y el alcance de su organización. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'aliado', permission: 'case.assign' });
  return runAction(reassignCaseAction, await bodyAsForm(request));
});
