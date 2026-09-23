import { addInteractionAction } from '@/app/(plataforma)/aliado/clientes/actions';
import { assertCaseInScope } from '@/lib/movil/aliado';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Registra una interacción: { channel: LLAMADA|VISITA|WHATSAPP|CORREO|NOTA, summary, visibleToClient?: true }. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const opportunityId = await idParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'case.note' });
  await assertCaseInScope(session.user, opportunityId);
  return runAction(addInteractionAction, withFields(await bodyAsForm(request), { opportunityId }));
});
