import { revokeConsentAction } from '@/app/(plataforma)/empresa/clientes/[id]/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/clientes/[id]/consentimientos/revocar — Registra una revocación: { purpose, channel: ESCRITO|CORREO|TELEFONICO|PRESENCIAL|SOLICITUD_PLATAFORMA, evidence (mín. 10) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'consent.manage' });
  const id = await routeId(ctx, 'id');
  return runAction(revokeConsentAction, withFields(await formOf(request), { personId: id }));
});
