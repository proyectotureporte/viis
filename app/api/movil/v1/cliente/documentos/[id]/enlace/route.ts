import { documentLink } from '@/lib/movil/documents';
import { apiSession, handler, json } from '@/lib/movil/http';
import { idParam, type IdContext } from '@/lib/movil/util';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enlace firmado (5 min) a un documento PROPIO. 423 mientras está en verificación antivirus. */
export const GET = handler(async (_request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const session = await apiSession({ portal: 'cliente' });
  const doc = await getPrisma().document.findFirst({ where: { id, person: { userId: session.user.id } }, select: { id: true, status: true, scanResult: true } });
  return json(documentLink(doc, session.user.id));
});
