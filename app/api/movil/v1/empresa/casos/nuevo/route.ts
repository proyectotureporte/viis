import { createCaseAction } from '@/app/(plataforma)/empresa/casos/nuevo/actions';
import { nuevoCasoForm } from '@/lib/movil/empresa/caso';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, json, redirectTarget } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import type { ActionResult } from '@/lib/movil/contract-empresa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/casos/nuevo — Catálogos del formulario de alta (productos, entidades, responsables, autorizaciones). */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'empresa', permission: 'case.create' });
  return json(await nuevoCasoForm(session));
});

/**
 * POST /api/movil/v1/empresa/casos/nuevo — Alta de persona (sin duplicados) + caso: { documentType, documentNumber, firstName,
 * lastName, email?, phone?, city?, monthlyIncome?, product, amount?, entityId?, assigneeId?, nextAction?, consents: string[]
 * (incluye TRATAMIENTO), captureChannel, declaration: true }. Devuelve `id` del caso creado.
 */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'case.create' });
  const form = await formOf(request);
  let result: ActionResult;
  try {
    const state = await createCaseAction(null, form);
    result = state ? { ok: state.ok, message: state.message, at: state.at } : { ok: true, message: 'Listo.' };
  } catch (error) {
    const redirect = redirectTarget(error);
    if (!redirect) throw error;
    const id = redirect.match(/\/empresa\/casos\/([0-9a-f-]{36})/i)?.[1];
    const opp = id ? await getPrisma().opportunity.findUnique({ where: { id }, select: { code: true } }) : null;
    result = { ok: true, message: opp ? `Caso ${opp.code} creado.` : 'Caso creado.', redirect, id };
  }
  return json(result, result.ok ? 200 : 422);
});
