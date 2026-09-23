import { canAccessPerson } from '@/lib/domain/access';
import { documentLink } from '@/lib/movil/documents';
import { apiSession, handler, json } from '@/lib/movil/http';
import { idParam, type IdContext } from '@/lib/movil/util';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enlace firmado (5 min) a un documento de un cliente dentro del alcance del aliado. */
export const GET = handler(async (_request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'case.read' });
  const doc = await getPrisma().document.findUnique({ where: { id }, select: { id: true, status: true, scanResult: true, personId: true } });
  const allowed = doc ? await canAccessPerson(session, doc.personId) : false;
  return json(documentLink(allowed ? doc : null, session.user.id));
});
