import { catalogos } from '@/lib/movil/cliente';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Catálogos para los selectores de la app (sirve a cualquier portal con sesión). */
export const GET = handler(async () => {
  await apiSession();
  return json(await catalogos());
});
