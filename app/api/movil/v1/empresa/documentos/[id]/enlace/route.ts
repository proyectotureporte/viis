import { canAccessPerson } from '@/lib/domain/access';
import { documentLink, routeId, type RouteCtx } from '@/lib/movil/empresa/common';
import { apiSession, handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/movil/v1/empresa/documentos/{id}/enlace — URL firmada de 5 min para ver el documento (PDF con marca de agua).
 * Se verifica el acceso ANTES de firmar; la descarga en /api/documentos/{id} lo vuelve a verificar con el mismo Bearer.
 */
export const GET = handler(async (_request: Request, ctx: RouteCtx<'id'>) => {
  const session = await apiSession({ portal: 'empresa', permission: 'person.read' });
  const id = await routeId(ctx);
  const doc = await getPrisma().document.findUnique({ where: { id }, select: { id: true, status: true, scanResult: true, personId: true } });
  const allowed = doc ? await canAccessPerson(session, doc.personId) : false;
  return json(documentLink(allowed ? doc : null, session.user.id));
});
