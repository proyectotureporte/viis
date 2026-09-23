import { router, type Href } from 'expo-router';
import type { MobileLink } from '@/lib/movil/contract';

/**
 * Navegación del portal cliente. Las rutas se escriben con el grupo `(cliente)`
 * para que no choquen con las de otros portales. `withAnchor` carga primero la
 * pantalla raíz de la pestaña para que "atrás" vuelva a ella.
 */
export function go(href: string) {
  router.push(href as Href, { withAnchor: true });
}

/** Vuelve a una pantalla que ya está en la pila (o la abre si no está). */
export function backTo(href: string) {
  router.dismissTo(href as Href, { withAnchor: true });
}

export const R = {
  inicio: '/(cliente)',
  credito: (loanId?: string) => (loanId ? `/(cliente)/credito?id=${loanId}` : '/(cliente)/credito'),
  creditoEditar: (loanId?: string) => (loanId ? `/(cliente)/credito/editar?id=${loanId}` : '/(cliente)/credito/editar'),
  amortizacion: (loanId: string) => `/(cliente)/credito/amortizacion?id=${loanId}`,
  decidir: '/(cliente)/decidir',
  simular: (sim: string) => `/(cliente)/decidir/simular?sim=${sim}`,
  escenario: (id: string) => `/(cliente)/decidir/escenario/${id}`,
  comparar: (a: string, b: string) => `/(cliente)/decidir/comparar?a=${a}&b=${b}`,
  gestiones: (tab?: 'pagos' | 'solicitudes' | 'casos') => (tab ? `/(cliente)/gestiones?tab=${tab}` : '/(cliente)/gestiones'),
  reportarPago: (loanId?: string) => (loanId ? `/(cliente)/gestiones/pago?loanId=${loanId}` : '/(cliente)/gestiones/pago'),
  nuevaSolicitud: (kind?: string) => (kind ? `/(cliente)/gestiones/nueva?kind=${kind}` : '/(cliente)/gestiones/nueva'),
  solicitud: (id: string) => `/(cliente)/gestiones/solicitud/${id}`,
  caso: (id: string) => `/(cliente)/gestiones/caso/${id}`,
  oferta: (id: string) => `/(cliente)/gestiones/oferta/${id}`,
  mas: '/(cliente)/mas',
  vivienda: '/(cliente)/mas/vivienda',
  inmueble: (id?: string) => (id ? `/(cliente)/mas/inmueble?id=${id}` : '/(cliente)/mas/inmueble'),
  valor: (propertyId: string) => `/(cliente)/mas/valor?propertyId=${propertyId}`,
  hogar: '/(cliente)/mas/hogar',
  documentos: '/(cliente)/mas/documentos',
  subir: (typeId?: string, caseId?: string) => {
    const q = [typeId ? `typeId=${typeId}` : '', caseId ? `caseId=${caseId}` : ''].filter(Boolean).join('&');
    return q ? `/(cliente)/mas/subir?${q}` : '/(cliente)/mas/subir';
  },
  ayuda: (section?: 'asesor' | 'pqr') => (section ? `/(cliente)/mas/ayuda?seccion=${section}` : '/(cliente)/mas/ayuda'),
  cuenta: '/cuenta',
  notificaciones: '/notificaciones',
};

/** Pantalla nativa a la que lleva un enlace del motor (próxima mejor acción, radar). */
export function linkHref(link: MobileLink): string {
  const p = link.params ?? {};
  switch (link.screen) {
    case 'inicio':
      return R.inicio;
    case 'hogar':
      return R.hogar;
    case 'vivienda':
      return R.vivienda;
    case 'credito':
      return R.credito(p.loanId);
    case 'decidir':
      return p.sim ? R.simular(p.sim) : R.decidir;
    case 'gestiones':
      return p.loanId ? R.reportarPago(p.loanId) : R.gestiones();
    case 'nueva-solicitud':
      return R.nuevaSolicitud(p.kind);
    case 'documentos':
      return R.documentos;
    case 'asesor':
      return R.ayuda('asesor');
    default:
      return R.inicio;
  }
}
