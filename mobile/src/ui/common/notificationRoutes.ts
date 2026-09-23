import { empresaRoute } from '@/ui/empresa/notificationRoute';

/**
 * Traduce el `href` web de una notificación a la pantalla nativa equivalente
 * del portal del usuario. Devuelve null si la app no tiene equivalente (en ese
 * caso la notificación solo se marca como leída).
 */
type Portal = 'cliente' | 'aliado' | 'empresa';
interface Params {
  get(key: string): string | null;
}

function parse(href: string) {
  const [pathAndQuery] = href.split('#');
  const [path, query = ''] = pathAndQuery.split('?');
  // Parser propio: URLSearchParams de React Native no implementa get() en todas las versiones.
  const map = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try {
      map.set(decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' ')));
    } catch {
      // parámetro mal codificado: se ignora
    }
  }
  const params: Params = { get: (k) => map.get(k) ?? null };
  return { segments: path.split('/').filter(Boolean), params };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clienteRoute(segments: string[], params: Params): string | null {
  const [section] = segments;
  switch (section) {
    case undefined:
      return '/(cliente)';
    case 'credito':
      return params.get('id') && UUID.test(params.get('id')!) ? `/(cliente)/credito?id=${params.get('id')}` : '/(cliente)/credito';
    case 'decidir': {
      const sim = params.get('sim');
      return sim && /^[A-Z_]+$/.test(sim) ? `/(cliente)/decidir/simular?sim=${sim}` : '/(cliente)/decidir';
    }
    case 'gestiones': {
      const solicitud = params.get('solicitud');
      if (solicitud && UUID.test(solicitud)) return `/(cliente)/gestiones/solicitud/${solicitud}`;
      const nueva = params.get('nueva');
      if (nueva && /^[A-Z_]+$/.test(nueva)) return `/(cliente)/gestiones/nueva?kind=${nueva}`;
      const credito = params.get('credito');
      if (credito && UUID.test(credito)) return `/(cliente)/gestiones/pago?loanId=${credito}`;
      return '/(cliente)/gestiones';
    }
    case 'documentos':
      return '/(cliente)/mas/documentos';
    case 'vivienda':
      return '/(cliente)/mas/vivienda';
    case 'hogar':
      return '/(cliente)/mas/hogar';
    case 'ayuda':
      return '/(cliente)/mas/ayuda';
    default:
      return null;
  }
}

const ID = /^[0-9a-z-]{1,64}$/i;

function aliadoRoute(segments: string[]): string | null {
  const [section, id] = segments;
  switch (section) {
    case undefined:
      return '/(aliado)';
    case 'clientes':
      return id && UUID.test(id) ? `/(aliado)/clientes/${id}` : '/(aliado)/clientes';
    case 'agenda':
      return '/(aliado)/agenda';
    case 'comisiones':
      return '/(aliado)/comisiones';
    case 'embudo':
      return '/(aliado)/mas/embudo';
    case 'academia':
      return id && ID.test(id) ? `/(aliado)/mas/academia/${id}` : '/(aliado)/mas/academia';
    default:
      return null;
  }
}

/** La consola empresa define su propio mapeo (src/ui/empresa/notificationRoute.ts). */

export function nativeRouteFor(href: string | null, portal: Portal): string | null {
  if (!href || !href.startsWith('/')) return null;
  const { segments, params } = parse(href);
  const [root, ...rest] = segments;
  if (root === 'cuenta') return '/cuenta';
  if (root !== portal) return null;
  if (portal === 'cliente') return clienteRoute(rest, params);
  if (portal === 'aliado') return aliadoRoute(rest);
  return empresaRoute(rest, params);
}
