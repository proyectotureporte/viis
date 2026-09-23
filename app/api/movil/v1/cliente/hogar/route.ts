import { saveHouseholdAction } from '@/app/(plataforma)/cliente/hogar/actions';
import { clientContext, clienteHogar } from '@/lib/movil/cliente';
import { apiSession, bodyAsForm, handler, json, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { person } = await clientContext();
  return json(clienteHogar(person));
});

/** Objetivos y finanzas del hogar: { goals: string[], goalsNote?, monthlyIncome?, monthlyExpenses?, savings?, city? }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'cliente' });
  return runAction(saveHouseholdAction, await bodyAsForm(request));
});
