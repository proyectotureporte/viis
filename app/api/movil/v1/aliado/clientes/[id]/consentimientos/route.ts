import { addConsentAction } from '@/app/(plataforma)/aliado/clientes/actions';
import { assertCaseInScope } from '@/lib/movil/aliado';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Suma autorizaciones del cliente: { consents: string[], declaration: true }. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const opportunityId = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'person.create' });
  await assertCaseInScope(session.user, opportunityId);
  return runAction(addConsentAction, withFields(await bodyAsForm(request), { opportunityId }));
});
