import { aliadoComisiones } from '@/lib/movil/aliado';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liquidaciones con el desglose del snapshot de la regla y reglas vigentes con ejemplo. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'aliado', permission: 'commission.read' });
  return json(await aliadoComisiones(session.user));
});
