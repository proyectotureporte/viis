import { paramsOf } from '@/lib/movil/empresa/common';
import { comisiones } from '@/lib/movil/empresa/red';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/comisiones — ?tab=liquidacion (estado, aliado, desde, hasta, pagina) | resumen (desde, hasta, estado) | reglas */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'commission.approve' });
  return json(await comisiones(session, paramsOf(request)));
});
