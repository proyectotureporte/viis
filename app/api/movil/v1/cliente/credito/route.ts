import { saveLoanAction } from '@/app/(plataforma)/cliente/credito/actions';
import { runActionWithId } from '@/lib/movil/actions';
import { clientContext, clienteCredito } from '@/lib/movil/cliente';
import { ApiError, bodyAsForm, handler, json } from '@/lib/movil/http';
import { intParam } from '@/lib/movil/util';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Créditos activos; detalle del `?id=` (o el primero) con tabla restante paginada `?pagina=` (24 filas). */
export const GET = handler(async (request: Request) => {
  const { person } = await clientContext();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('Crédito no encontrado.', 404);
  return json(await clienteCredito(person, id, intParam(url, 'pagina')));
});

/**
 * Crea (sin `id`) o edita (con `id`) un crédito: { id?, alias, entityId?, propertyId?, system, rateEa: "12,5",
 * termMonths, originalAmount, disbursedAt, balance, balanceAsOf, paidInstallments, monthlyInsurance, paymentDay }.
 */
export const POST = handler(async (request: Request) => {
  const { person } = await clientContext();
  const form = await bodyAsForm(request);
  const editing = typeof form.get('id') === 'string' && form.get('id') !== '' ? String(form.get('id')) : null;
  return runActionWithId(saveLoanAction, form, async (_r, since) =>
    editing ?? (await getPrisma().loan.findFirst({ where: { personId: person.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id,
  );
});
