import { pagos } from '@/lib/movil/empresa/colas';
import { paramsOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/pagos — ?tab=cola|conciliar|historico&pagina */
export const GET = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'payment.review' });
  return json(await pagos(paramsOf(request)));
});
