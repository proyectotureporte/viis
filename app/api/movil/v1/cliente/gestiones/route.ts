import { clientContext, clienteGestiones } from '@/lib/movil/cliente';
import { handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pagos reportados, solicitudes y casos (etapas, interacciones visibles y ofertas). */
export const GET = handler(async () => {
  const { person } = await clientContext();
  return json(await clienteGestiones(person));
});
