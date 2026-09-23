import { inviteStaffAction } from '@/app/(plataforma)/empresa/usuarios/actions';
import { formOf, paramsOf } from '@/lib/movil/empresa/common';
import { usuarios } from '@/lib/movil/empresa/control';
import { apiSession, handler, json, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/usuarios — ?q&rol&estado=activos|inactivos|pendientes|sin-mfa&pagina (con sesiones activas). */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'user.manage' });
  return json(await usuarios(session, paramsOf(request)));
});

/** POST /api/movil/v1/empresa/usuarios — Invita a una persona del equipo: { name, email, role }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'user.manage' });
  return runAction(inviteStaffAction, await formOf(request));
});
