import { solicitudes } from '@/lib/movil/empresa/colas';
import { paramsOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/solicitudes — ?estado&tipo&resp=yo|ninguno|<uuid>&vencidas=1&pagina (ordenadas por SLA). */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'request.manage' });
  return json(await solicitudes(session, paramsOf(request)));
});
