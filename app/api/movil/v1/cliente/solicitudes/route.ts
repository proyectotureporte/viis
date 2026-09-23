import { createRequestAction } from '@/app/(plataforma)/cliente/gestiones/actions';
import { requestCodeIn, runActionWithId } from '@/lib/movil/actions';
import { clientContext } from '@/lib/movil/cliente';
import { apiSession, bodyAsForm, handler } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Nueva solicitud: { kind, subject, detail, incomeDrop?: "30" (%), newExpense? }. Para HARDSHIP el servidor
 * añade el resumen del Modo Tranquilidad. Devuelve el id de la solicitud.
 */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'cliente', permission: 'request.create' });
  const { person } = await clientContext();
  return runActionWithId(createRequestAction, await bodyAsForm(request), async (r) => {
    const code = requestCodeIn(r.message);
    return code ? (await getPrisma().serviceRequest.findFirst({ where: { code, personId: person.id }, select: { id: true } }))?.id : null;
  });
});
