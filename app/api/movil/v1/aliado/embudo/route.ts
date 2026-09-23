import { aliadoEmbudo } from '@/lib/movil/aliado';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Casos por etapa, conversión, tiempos por etapa y desistimiento. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'aliado', permission: 'case.read' });
  return json(await aliadoEmbudo(session.user));
});
