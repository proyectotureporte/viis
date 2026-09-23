import { bandejaAction } from '@/app/(plataforma)/empresa/bandeja/actions';
import { formOf, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/bandeja/escalar — Escalamiento masivo: { ids: string[], reason (mín. 5) }. Sube prioridad y notifica a coordinación. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'case.stage' });
  return runAction(bandejaAction, withFields(await formOf(request), { op: 'bulk-escalate' }));
});
