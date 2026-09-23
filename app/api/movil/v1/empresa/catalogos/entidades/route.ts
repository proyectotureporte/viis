import { createEntityAction } from '@/app/(plataforma)/empresa/catalogos/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/catalogos/entidades — Crea entidad: { name, slaHours, agreement?: boolean, notes? }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'catalog.manage' });
  return runAction(createEntityAction, await formOf(request));
});
