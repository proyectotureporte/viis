import { bandeja } from '@/lib/movil/empresa/bandeja';
import { paramsOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/bandeja — ?q&etapa&prioridad&producto&responsable(uuid|none)&entidad&canal&vencidos=1&pagina */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'case.read' });
  return json(await bandeja(session, paramsOf(request)));
});
