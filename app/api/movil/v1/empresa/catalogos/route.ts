import { catalogos } from '@/lib/movil/empresa/control';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/catalogos — Entidades, tasas de referencia, parámetros financieros, tipos documentales y cursos. */
export const GET = handler(async () => {
  await apiSession({ portal: 'empresa', permission: 'catalog.manage' });
  return json(await catalogos());
});
