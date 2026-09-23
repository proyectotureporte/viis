import { saveScenarioAction } from '@/app/(plataforma)/cliente/decidir/actions';
import { runActionWithId } from '@/lib/movil/actions';
import { clientContext, clienteEscenarios } from '@/lib/movil/cliente';
import { bodyAsForm, handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Escenarios guardados + contexto para simular en el teléfono (créditos como `state`, hogar, tasa de referencia). */
export const GET = handler(async () => {
  const { session, person } = await clientContext();
  return json(await clienteEscenarios(session, person));
});

/**
 * Guarda un escenario: { kind, name, loanId?, params } donde `params` es el objeto de entradas
 * (o su JSON en texto). El servidor recalcula con el crédito de la base de datos; nunca usa resultados del teléfono.
 */
export const POST = handler(async (request: Request) => {
  const { session } = await clientContext();
  return runActionWithId(saveScenarioAction, await bodyAsForm(request), async (_r, since) =>
    (await getPrisma().scenario.findFirst({ where: { userId: session.user.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id,
  );
});
