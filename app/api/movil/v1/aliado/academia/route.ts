import { aliadoAcademia } from '@/lib/movil/aliado';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cursos con progreso, certificación vigente y bloqueo de radicación. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'aliado', permission: 'academy.take' });
  return json(await aliadoAcademia(session.user));
});
