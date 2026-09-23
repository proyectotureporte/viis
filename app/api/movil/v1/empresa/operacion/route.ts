import { operacion } from '@/lib/movil/empresa/operacion';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/operacion — Centro de operación: KPIs, alertas SLA, casos urgentes, mis tareas, embudo del mes y canales. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'empresa' });
  return json(await operacion(session));
});
