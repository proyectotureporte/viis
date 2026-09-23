import { auditoria } from '@/lib/movil/empresa/auditoria';
import { paramsOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/auditoria — ?accion&entidad&id&actor(correo|uuid)&desde&hasta · cursor ?antes=<id> | ?despues=<id> (50 por página). */
export const GET = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'audit.read' });
  return json(await auditoria(paramsOf(request)));
});
