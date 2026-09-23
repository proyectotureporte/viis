import { fetch } from 'expo/fetch';
import { API_URL, USER_AGENT } from './config';

/**
 * Cliente HTTP de la API móvil (/api/movil/v1). El token vive solo en memoria;
 * al reiniciar la app se obtiene uno nuevo con el dispositivo de confianza
 * (biometría) o con usuario + contraseña + MFA.
 */

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(value: string | null) {
  token = value;
}
export function getToken() {
  return token;
}
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: unknown) {
    super(message);
  }
}

export interface ActionResult {
  ok: boolean;
  message: string;
  redirect?: string;
  [key: string]: unknown;
}

type Body = Record<string, unknown> | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body, opts: { auth?: string | null; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
  const bearer = opts.auth === undefined ? token : opts.auth;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let payload: string | FormData | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/api/') ? path : `/api/movil/v1${path}`}`;
  let response: Response;
  try {
    response = (await fetch(url, { method, headers, body: payload })) as unknown as Response;
  } catch {
    throw new ApiError('Sin conexión. Revisa tu internet e inténtalo de nuevo.', 0);
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.status === 401 && bearer && bearer === token) onUnauthorized?.();
  // Las acciones devuelven 422 con {ok:false,message}: se entregan como dato, no como excepción.
  if (!response.ok && !(response.status === 422 && data && typeof data === 'object' && 'ok' in data)) {
    const message = (data as { message?: string } | null)?.message ?? `Error ${response.status}`;
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: { auth?: string | null }) => request<T>('GET', path, undefined, opts),
  post: <T = ActionResult>(path: string, body?: Body, opts?: { auth?: string | null }) => request<T>('POST', path, body ?? {}, opts),
};

/** Construye FormData para endpoints multipart (archivos del móvil). */
export function formData(fields: Record<string, string | number | boolean | undefined | null | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => form.append(key, v));
    else form.append(key, value === true ? 'on' : String(value));
  }
  return form;
}
