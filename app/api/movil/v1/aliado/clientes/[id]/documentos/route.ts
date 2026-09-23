import { uploadDocumentAction } from '@/app/(plataforma)/aliado/clientes/actions';
import { assertCaseInScope } from '@/lib/movil/aliado';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Carga un documento del caso (foto de la cámara o PDF). MULTIPART: typeId, file. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const opportunityId = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'doc.upload' });
  await assertCaseInScope(session.user, opportunityId);
  return runAction(uploadDocumentAction, withFields(await bodyAsForm(request), { opportunityId }));
});
