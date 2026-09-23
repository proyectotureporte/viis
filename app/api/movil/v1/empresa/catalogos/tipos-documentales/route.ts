import { createDocTypeAction } from '@/app/(plataforma)/empresa/catalogos/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/catalogos/tipos-documentales — Crea tipo documental: { code, name, description?, validityDays?, products?: string[], required?: boolean, active?: boolean, sortOrder }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'catalog.manage' });
  return runAction(createDocTypeAction, await formOf(request));
});
