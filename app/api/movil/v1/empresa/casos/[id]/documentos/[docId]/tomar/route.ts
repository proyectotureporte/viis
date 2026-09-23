import { takeDocAction } from '@/app/(plataforma)/empresa/casos/[id]/actions';
import { type RouteCtx, assertCaseVisible, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/casos/[id]/documentos/[docId]/tomar — Toma el documento en revisión. Sin cuerpo. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id' | 'docId'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'doc.review' });
  const id = await routeId(ctx, 'id');
  const docId = await routeId(ctx, 'docId');
  await assertCaseVisible(session, id);
  return runAction(takeDocAction, withFields(await formOf(request), { opportunityId: id, documentId: docId }));
});
