import { documentos } from '@/lib/movil/empresa/colas';
import { paramsOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/documentos — Cola de revisión: ?estado=UPLOADED|IN_REVIEW&tipo=<uuid>&mios=1&pagina */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'doc.review' });
  return json(await documentos(session, paramsOf(request)));
});
