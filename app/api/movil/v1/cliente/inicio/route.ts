import { clienteInicio } from '@/lib/movil/cliente';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Inicio patrimonial: patrimonio, avance, próxima mejor acción, próximo pago, radar, casos y onboarding. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'cliente' });
  return json(await clienteInicio(session));
});
