import { paramsOf } from '@/lib/movil/empresa/common';
import { clientes } from '@/lib/movil/empresa/personas';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/movil/v1/empresa/clientes — ?q (nombre, correo o últimos 4) o ?tipo=CC&doc=<número> (búsqueda exacta
 * por índice ciego) · ?pagina. Preferible POST clientes/buscar-documento para no dejar el número en la URL.
 */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'person.read' });
  return json(await clientes(session, paramsOf(request)));
});
