import { menu } from '@/lib/movil/empresa/operacion';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/menu — Áreas visibles para el rol (misma matriz que la web) con contadores para badges. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'empresa' });
  return json(await menu(session));
});
