import { declareValueAction } from '@/app/(plataforma)/cliente/vivienda/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Valor declarado: { propertyId, value, low?, high?, asOf: 'YYYY-MM-DD', basis, note? }. Queda con confianza DECLARED. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'cliente' });
  return runAction(declareValueAction, await bodyAsForm(request));
});
