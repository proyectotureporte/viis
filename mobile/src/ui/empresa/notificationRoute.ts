/**
 * `href` web de una notificación de la consola (`/empresa/...`) → pantalla
 * nativa equivalente. Devuelve null si no hay equivalente.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AREA_KEYS = ['leads', 'clientes', 'documentos', 'pagos', 'solicitudes', 'aliados', 'comisiones', 'analitica', 'auditoria', 'catalogos', 'usuarios'];

export function empresaRoute(segments: string[], params: { get(key: string): string | null }): string | null {
  const [section, id] = segments;
  if (!section) return '/(empresa)/(tabs)';
  if (section === 'bandeja') {
    const q = params.get('q');
    return q && /^[\w-]{2,40}$/.test(q) ? `/(empresa)/(tabs)/bandeja?q=${encodeURIComponent(q)}` : '/(empresa)/(tabs)/bandeja';
  }
  if (section === 'casos' && id === 'nuevo') return '/(empresa)/casos/nuevo';
  if (['casos', 'clientes', 'solicitudes', 'aliados'].includes(section) && id && UUID.test(id)) return `/(empresa)/${section}/${id}`;
  if (AREA_KEYS.includes(section)) return `/(empresa)/area/${section}`;
  return null;
}
