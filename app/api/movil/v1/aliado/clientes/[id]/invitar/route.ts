import { inviteClientAction } from '@/app/(plataforma)/aliado/clientes/actions';
import { assertCaseInScope } from '@/lib/movil/aliado';
import { apiSession, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Invita al cliente a crear su cuenta (máximo una vez cada 24 h). */
export const POST = handler(async (_request: Request, ctx: IdContext) => {
  const opportunityId = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'case.note' });
  await assertCaseInScope(session.user, opportunityId);
  return runAction(inviteClientAction, withFields(new FormData(), { opportunityId }));
});
