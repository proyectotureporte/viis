import { aliadoResumen } from '@/lib/movil/aliado';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** KPIs, clientes urgentes, tareas de hoy, certificaciones (y bloqueo de radicación) y avisos sin leer. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'aliado' });
  return json(await aliadoResumen(session.user));
});
