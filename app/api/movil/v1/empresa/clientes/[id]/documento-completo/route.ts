import { revealDocumentAction } from '@/app/(plataforma)/empresa/clientes/[id]/actions';
import { type RouteCtx, formOf, routeId, withFields } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/clientes/[id]/documento-completo — Documento y teléfono completos (en `message`). La consulta queda en la bitácora. Sin cuerpo. */
export const POST = handler(async (request: Request, ctx: RouteCtx<'id'>) => {
  await apiSession({ portal: 'empresa', permission: 'person.read' });
  const id = await routeId(ctx, 'id');
  return runAction(revealDocumentAction, withFields(await formOf(request), { personId: id }));
});
