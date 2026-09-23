import { takeDocumentAction } from '@/app/(plataforma)/empresa/documentos/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/documentos/[id]/tomar — Toma el documento en revisión. Sin cuerpo. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'doc.review' });
  const id = await routeId(ctx, 'id');
  return runAction(takeDocumentAction, withFields(await formOf(request), { documentId: id }));
});
