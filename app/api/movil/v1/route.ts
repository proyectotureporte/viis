import { json } from '@/lib/movil/http';

export const dynamic = 'force-dynamic';

/** Versión mínima de la app soportada por la API: permite forzar actualizaciones. */
export function GET(): Response {
  return json({ api: 'openv-movil', version: 'v1', minAppVersion: '1.0.0', downloads: { android: '/app.apk', ios: '/app.ipa' } });
}
