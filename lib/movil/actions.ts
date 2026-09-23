import type { ActionState } from '@/components/ov/forms';
import type { ActionResult } from './contract';
import { json, redirectTarget } from './http';

/**
 * Variante de `runAction` para cuando la app necesita además el id del
 * registro creado: ejecuta la MISMA server action de la web (permisos,
 * validación, auditoría) y, si tuvo éxito, deja que el llamador lo resuelva.
 */
type Action = (prev: ActionState, form: FormData) => Promise<ActionState | null | undefined>;

export async function callAction(action: Action, form: FormData): Promise<ActionResult> {
  try {
    const state = await action(null, form);
    if (!state) return { ok: true, message: 'Listo.' };
    return state as ActionResult;
  } catch (error) {
    const redirect = redirectTarget(error);
    if (redirect) return { ok: true, message: 'Listo.', redirect };
    throw error;
  }
}

export function actionResponse(result: ActionResult): Response {
  return json(result, result.ok ? 200 : 422);
}

/** Ejecuta la acción y, si tuvo éxito, agrega `id` con lo que devuelva `findId`. */
export async function runActionWithId(action: Action, form: FormData, findId: (result: ActionResult, startedAt: Date) => Promise<string | null | undefined>): Promise<Response> {
  const startedAt = new Date(Date.now() - 60_000);
  const result = await callAction(action, form);
  if (result.ok) {
    const id = await findId(result, startedAt);
    if (id) result.id = id;
  }
  return actionResponse(result);
}

/** Primer código de solicitud (SOL-1234) mencionado en el mensaje de la acción. */
export function requestCodeIn(message: string): string | null {
  return message.match(/\bSOL-\d+\b/)?.[0] ?? null;
}
