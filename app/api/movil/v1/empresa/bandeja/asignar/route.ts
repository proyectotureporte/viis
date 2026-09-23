import { bandejaAction } from '@/app/(plataforma)/empresa/bandeja/actions';
import { formOf, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/bandeja/asignar — Asignación masiva: { ids: string[] (máx. 100), assigneeId: uuid | "none" }. Cada caso se revalida contra tu alcance. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'case.assign' });
  return runAction(bandejaAction, withFields(await formOf(request), { op: 'bulk-assign' }));
});
