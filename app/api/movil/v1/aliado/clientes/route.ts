import { createClientAction } from '@/app/(plataforma)/aliado/clientes/actions';
import { runActionWithId } from '@/lib/movil/actions';
import { aliadoClientes } from '@/lib/movil/aliado';
import { apiSession, bodyAsForm, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Casos del alcance del aliado: `?q=` (nombre, OV-1001 o últimos 4), `?etapa=`, `?pagina=` (50 por página). */
export const GET = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'aliado', permission: 'case.read' });
  return json(await aliadoClientes(session.user, new URL(request.url)));
});

/**
 * Alta de cliente + caso sin duplicados y con consentimiento: { documentType, documentNumber, firstName, lastName,
 * email?, phone?, city?, monthlyIncome?, product, amount?, consents: string[] (incluye TRATAMIENTO), declaration: true,
 * invite?: true }. Devuelve `id` del caso creado.
 */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'aliado', permission: 'case.create' });
  return runActionWithId(createClientAction, await bodyAsForm(request), async (r) => r.href?.match(/\/aliado\/clientes\/([0-9a-f-]{36})/i)?.[1]);
});
