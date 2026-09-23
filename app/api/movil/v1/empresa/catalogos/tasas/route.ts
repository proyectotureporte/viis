import { createRateAction } from '@/app/(plataforma)/empresa/catalogos/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/catalogos/tasas — Registra tasa: { entityId? , product, system, rateEa: "12,5", source, asOf, validUntil? }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'catalog.manage' });
  return runAction(createRateAction, await formOf(request));
});
