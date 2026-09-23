import { createParameterAction } from '@/app/(plataforma)/empresa/catalogos/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/catalogos/parametros — Registra parámetro: { key (p. ej. UVR, INFLACION_PROYECTADA en %), value, source, asOf }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'catalog.manage' });
  return runAction(createParameterAction, await formOf(request));
});
