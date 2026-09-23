import { approveCommissionsAction } from '@/app/(plataforma)/empresa/comisiones/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/comisiones/aprobar — Aprueba en lote: { ids: string[] (máx. 200) }. Solo las causadas. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'commission.approve' });
  return runAction(approveCommissionsAction, await formOf(request));
});
