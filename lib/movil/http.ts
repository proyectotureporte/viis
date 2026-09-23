import '@/lib/zod-es';
import type { ActionState } from '@/components/ov/forms';
import { can, portalFor, type Permission, type Portal } from '@/lib/security/rbac';
import { getSession, type CurrentSession } from '@/lib/security/session';

/**
 * Utilidades de la API móvil (`/api/movil/v1`). La app se autentica con
 * `Authorization: Bearer <token>`; getSession() acepta ese encabezado, así que
 * las MISMAS server actions de la web (permisos, validación, auditoría) se
 * reutilizan aquí sin duplicar reglas.
 */

export const API_VERSION = 'v1';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ ok: false, message, ...extra }, status);
}

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Sesión completa (MFA superado) y, opcionalmente, portal y permiso. Lanza ApiError 401/403. */
export async function apiSession(options: { portal?: Portal; permission?: Permission } = {}): Promise<CurrentSession> {
  const session = await getSession();
  if (!session || !session.mfaPassed || !session.user.totpEnabled) throw new ApiError('Sesión vencida. Vuelve a ingresar.', 401);
  if (options.portal && portalFor(session.user.role) !== options.portal) throw new ApiError('Esta sección no corresponde a tu perfil.', 403);
  if (options.permission && !can(session.user.role, options.permission)) throw new ApiError('No tienes permiso para esta acción.', 403);
  return session;
}

/** Envuelve un handler: traduce ApiError y errores inesperados a JSON seguro. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) return apiError(error.message, error.status);
      const redirect = redirectTarget(error);
      if (redirect) return json({ ok: true, redirect });
      console.error('API móvil', { error: error instanceof Error ? error.message : 'desconocido' });
      return apiError('No pudimos completar la solicitud. Inténtalo de nuevo.', 500);
    }
  };
}

/** Las server actions a veces terminan con redirect(): lo convertimos en un dato. */
export function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: unknown })?.digest;
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return digest.split(';')[2] ?? '/';
  return null;
}

/**
 * Convierte el cuerpo (multipart o JSON) en FormData con la misma forma que
 * los formularios web: arreglos → campos repetidos, true → "on".
 */
export async function bodyAsForm(request: Request): Promise<FormData> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
    return request.formData();
  }
  const form = new FormData();
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    throw new ApiError('Cuerpo JSON inválido.', 400);
  }
  if (!body || typeof body !== 'object') return form;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === null || item === undefined || item === false) continue;
      form.append(key, item === true ? 'on' : typeof item === 'object' ? JSON.stringify(item) : String(item));
    }
  }
  return form;
}

type Action = (prev: ActionState, form: FormData) => Promise<ActionState | null | undefined>;

/** Ejecuta una server action existente y responde {ok, message} con 200 o 422. */
export async function runAction(action: Action, form: FormData): Promise<Response> {
  try {
    const state = await action(null, form);
    if (!state) return json({ ok: true, message: 'Listo.' });
    return json(state, state.ok ? 200 : 422);
  } catch (error) {
    const redirect = redirectTarget(error);
    if (redirect) return json({ ok: true, message: 'Listo.', redirect });
    throw error;
  }
}
