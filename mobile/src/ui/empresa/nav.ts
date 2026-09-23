import type { Href } from 'expo-router';
import { ChartColumn, FileCheck, Handshake, House, Inbox, Megaphone, MessagesSquare, Receipt, Settings2, ShieldCheck, UserCog, Users, Wallet, type LucideIcon } from 'lucide-react-native';
import type { AreaKey, Permission } from '@/lib/movil/contract-empresa';

/** Áreas de la consola (mismas de `components/ov/nav.ts` de la web). */
export interface AreaMeta {
  key: AreaKey;
  label: string;
  permission: Permission | null;
  icon: LucideIcon;
  group: string;
  description: string;
}

export const AREAS: AreaMeta[] = [
  { key: 'operacion', label: 'Operación', permission: null, icon: House, group: 'Operación', description: 'Alertas, KPIs y tus tareas' },
  { key: 'bandeja', label: 'Bandeja', permission: 'case.read', icon: Inbox, group: 'Operación', description: 'Casos por prioridad y SLA' },
  { key: 'leads', label: 'Leads web', permission: 'lead.manage', icon: Megaphone, group: 'Operación', description: 'Contactos de la web por gestionar' },
  { key: 'clientes', label: 'Clientes', permission: 'person.read', icon: Users, group: 'Operación', description: 'Búsqueda y ficha 360 del cliente' },
  { key: 'documentos', label: 'Documentos', permission: 'doc.review', icon: FileCheck, group: 'Operación', description: 'Cola de revisión documental' },
  { key: 'pagos', label: 'Pagos', permission: 'payment.review', icon: Receipt, group: 'Posventa', description: 'Validación y conciliación de pagos' },
  { key: 'solicitudes', label: 'Solicitudes', permission: 'request.manage', icon: MessagesSquare, group: 'Posventa', description: 'Solicitudes de clientes por SLA' },
  { key: 'aliados', label: 'Aliados', permission: 'ally.manage', icon: Handshake, group: 'Red', description: 'Ranking responsable, usuarios y metas' },
  { key: 'comisiones', label: 'Comisiones', permission: 'commission.approve', icon: Wallet, group: 'Red', description: 'Liquidación, reglas y cierre' },
  { key: 'analitica', label: 'Analítica', permission: 'analytics.read', icon: ChartColumn, group: 'Control', description: 'Embudo, conversión, SLA y métrica norte' },
  { key: 'auditoria', label: 'Auditoría', permission: 'audit.read', icon: ShieldCheck, group: 'Control', description: 'Bitácora inmutable y verificación' },
  { key: 'catalogos', label: 'Entidades y reglas', permission: 'catalog.manage', icon: Settings2, group: 'Administración', description: 'Entidades, tasas, parámetros, tipos y cursos' },
  { key: 'usuarios', label: 'Usuarios', permission: 'user.manage', icon: UserCog, group: 'Administración', description: 'Personal interno, roles, MFA y sesiones' },
];

export const areaMeta = (key: AreaKey) => AREAS.find((a) => a.key === key)!;

/** Colas de trabajo de la pestaña Pendientes, en orden. */
export const QUEUE_KEYS: AreaKey[] = ['documentos', 'pagos', 'solicitudes', 'leads'];

/** Cuarta pestaña: Analítica si el rol la tiene; si no, el área más útil disponible. */
export const PANEL_PREFERENCE: AreaKey[] = ['analitica', 'comisiones', 'clientes'];

export const TAB_KEYS: AreaKey[] = ['operacion', 'bandeja'];

// ── Rutas (con el grupo explícito: otros portales tienen rutas homónimas) ──

export const routes = {
  caso: (id: string) => `/(empresa)/casos/${id}` as Href,
  nuevoCaso: () => '/(empresa)/casos/nuevo' as Href,
  cliente: (id: string) => `/(empresa)/clientes/${id}` as Href,
  solicitud: (id: string) => `/(empresa)/solicitudes/${id}` as Href,
  aliado: (id: string) => `/(empresa)/aliados/${id}` as Href,
  area: (key: AreaKey) => `/(empresa)/area/${key}` as Href,
  tab: (name: 'bandeja' | 'pendientes' | 'panel' | 'mas') => `/(empresa)/(tabs)/${name}` as Href,
};
