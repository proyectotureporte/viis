import { setPriorityAction } from '@/app/(plataforma)/empresa/casos/[id]/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, ApiError, handler, json } from '@/lib/movil/http';
import type { BulkActionResult } from '@/lib/movil/contract-empresa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/movil/v1/empresa/bandeja/prioridad — Prioridad de uno o varios casos: { ids: string[] (máx. 100), priority }.
 * Ejecuta la MISMA acción del expediente (permiso case.assign, alcance y bitácora) caso por caso.
 */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'case.assign' });
  const form = await formOf(request);
  const ids = [...new Set(form.getAll('ids').map(String))];
  const priority = String(form.get('priority') ?? '');
  if (!ids.length || ids.length > 100 || !ids.every((id) => UUID.test(id))) throw new ApiError('Selecciona entre 1 y 100 casos.', 400);
  const results: BulkActionResult['results'] = [];
  for (const id of ids) {
    const f = new FormData();
    f.set('opportunityId', id);
    f.set('priority', priority);
    const state = await setPriorityAction(null, f);
    results.push({ id, ok: Boolean(state?.ok), message: state?.message ?? 'Listo.' });
  }
  const done = results.filter((r) => r.ok).length;
  const body: BulkActionResult = {
    ok: done > 0,
    message: done === ids.length ? `Prioridad actualizada en ${done} caso(s).` : `Prioridad actualizada en ${done} de ${ids.length} caso(s).`,
    results,
  };
  return json(body, done > 0 ? 200 : 422);
});
