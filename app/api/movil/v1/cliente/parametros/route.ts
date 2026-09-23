import { clienteParametros } from '@/lib/movil/cliente';
import { apiSession, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** UVR, inflación proyectada y tasas de referencia vigentes, con fuente y fecha, para simular en el teléfono. */
export const GET = handler(async () => {
  await apiSession({ portal: 'cliente' });
  return json(await clienteParametros());
});
