import { requestAppraisalAction } from '@/app/(plataforma)/cliente/vivienda/actions';
import { requestCodeIn, runActionWithId } from '@/lib/movil/actions';
import { clientContext } from '@/lib/movil/cliente';
import { bodyAsForm, handler } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Solicitud de avalúo comercial formal: { propertyId, detail? }. Devuelve el id de la solicitud creada. */
export const POST = handler(async (request: Request) => {
  const { person } = await clientContext();
  return runActionWithId(requestAppraisalAction, await bodyAsForm(request), async (r) => {
    const code = requestCodeIn(r.message);
    return code ? (await getPrisma().serviceRequest.findFirst({ where: { code, personId: person.id }, select: { id: true } }))?.id : null;
  });
});
