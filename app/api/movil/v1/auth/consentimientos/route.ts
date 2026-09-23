import { CONSENT_PURPOSES, CONSENT_VERSION } from '@/lib/consent';
import { json } from '@/lib/movil/http';

export const dynamic = 'force-dynamic';

/** Textos de autorización vigentes: la app muestra exactamente lo que el servidor registra. */
export function GET(): Response {
  return json({ ok: true, version: CONSENT_VERSION, purposes: CONSENT_PURPOSES });
}
