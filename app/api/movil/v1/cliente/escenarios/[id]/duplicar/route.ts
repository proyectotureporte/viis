import { duplicateScenarioAction } from '@/app/(plataforma)/cliente/decidir/actions';
import { runActionWithId } from '@/lib/movil/actions';
import { clientContext } from '@/lib/movil/cliente';
import { handler } from '@/lib/movil/http';
import { idParam, type IdContext } from '@/lib/movil/util';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Duplica un escenario propio. Devuelve el id de la copia. */
export const POST = handler(async (_request: Request, ctx: IdContext) => {
  const id = await idParam(ctx);
  const { session } = await clientContext();
  const form = new FormData();
  form.set('id', id);
  return runActionWithId(duplicateScenarioAction, form, async (_r, since) =>
    (await getPrisma().scenario.findFirst({ where: { userId: session.user.id, createdAt: { gte: since }, id: { not: id } }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id,
  );
});
