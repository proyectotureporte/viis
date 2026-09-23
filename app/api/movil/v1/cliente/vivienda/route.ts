import { savePropertyAction } from '@/app/(plataforma)/cliente/vivienda/actions';
import { runActionWithId } from '@/lib/movil/actions';
import { clientContext, clienteVivienda } from '@/lib/movil/cliente';
import { bodyAsForm, handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { person } = await clientContext();
  return json(await clienteVivienda(person));
});

/** Crea (sin `id`) o edita (con `id`) un inmueble: { id?, alias, address?, city?, kind, stratum?, areaM2?, isVis? }. */
export const POST = handler(async (request: Request) => {
  const { person } = await clientContext();
  const form = await bodyAsForm(request);
  const editing = typeof form.get('id') === 'string' && form.get('id') !== '' ? String(form.get('id')) : null;
  return runActionWithId(savePropertyAction, form, async (_r, since) =>
    editing ?? (await getPrisma().property.findFirst({ where: { personId: person.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id,
  );
});
