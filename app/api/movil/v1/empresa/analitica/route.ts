import { paramsOf } from '@/lib/movil/empresa/common';
import { analitica } from '@/lib/movil/empresa/control';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/analitica — ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (por defecto últimos 90 días, hora Bogotá). */
export const GET = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'analytics.read' });
  return json(await analitica(paramsOf(request)));
});
