import { paramsOf } from '@/lib/movil/empresa/common';
import { leads } from '@/lib/movil/empresa/personas';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/leads — ?estado=NEW|CONVERTED|DISCARDED (por defecto NEW) · ?pagina. Incluye catálogos del formulario de conversión. */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'lead.manage' });
  return json(await leads(session, paramsOf(request)));
});
