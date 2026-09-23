import { shareScenarioAction } from '@/app/(plataforma)/cliente/decidir/actions';
import { requestCodeIn, runActionWithId } from '@/lib/movil/actions';
import { clientContext } from '@/lib/movil/cliente';
import { bodyAsForm, handler } from '@/lib/movil/http';
import { idParam, withFields, type IdContext } from '@/lib/movil/util';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Comparte el escenario con un asesor (crea una solicitud): { note? }. Devuelve el id de la solicitud. */
export const POST = handler(async (request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const { person } = await clientContext();
  return runActionWithId(shareScenarioAction, withFields(await bodyAsForm(request), { id }), async (r) => {
    const code = requestCodeIn(r.message);
    return code ? (await getPrisma().serviceRequest.findFirst({ where: { code, personId: person.id }, select: { id: true } }))?.id : null;
  });
});
