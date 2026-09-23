import { uploadDocAction } from '@/app/(plataforma)/empresa/casos/[id]/actions';
import { type RouteCtx, assertCaseVisible, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/casos/[id]/documentos — Carga un documento en nombre del cliente: multipart { typeId, file (PDF/JPG/PNG, máx. 10 MB) }. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'doc.upload' });
  const id = await routeId(ctx, 'id');
  await assertCaseVisible(session, id);
  return runAction(uploadDocAction, withFields(await formOf(request), { opportunityId: id }));
});
