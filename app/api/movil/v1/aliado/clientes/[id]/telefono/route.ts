import { revealContactAction } from '@/app/(plataforma)/aliado/clientes/actions';
import { assertCaseInScope } from '@/lib/movil/aliado';
import { apiSession, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Revela el celular del cliente (queda auditado). El número llega en `message`. */
export const POST = handler(async (_request: Request, ctx: IdContext) => {
  const opportunityId = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'person.read' });
  await assertCaseInScope(session.user, opportunityId);
  return runAction(revealContactAction, withFields(new FormData(), { opportunityId }));
});
