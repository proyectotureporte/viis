import { createRuleAction } from '@/app/(plataforma)/empresa/comisiones/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/comisiones/reglas — Crea regla v1: { name, organizationId? | tier?, product?, percent: "1,2", withholdingPct, paymentDays, validFrom, validTo? }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'commission.rules' });
  return runAction(createRuleAction, await formOf(request));
});
