import { closeLoanAction } from '@/app/(plataforma)/cliente/credito/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cierra un crédito conservando su historial: { id, reason: 'PAID_OFF' | 'TRANSFERRED' | 'ERROR' }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'cliente' });
  return runAction(closeLoanAction, await bodyAsForm(request));
});
