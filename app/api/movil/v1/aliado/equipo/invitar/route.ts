import { inviteAllyAction } from '@/app/(plataforma)/aliado/equipo/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cuerpo: { name, email }. La action verifica que el usuario sea ALLY_ADMIN y el alcance de su organización. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'aliado', permission: 'case.assign' });
  return runAction(inviteAllyAction, await bodyAsForm(request));
});
