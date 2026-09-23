import type { Permission, Portal } from '@/lib/security/rbac';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  group?: string;
  mobile?: boolean;
}

/** Navegación por portal. Cada pestaña responde una pregunta de la especificación. */
export const NAV: Record<Portal, NavItem[]> = {
  cliente: [
    { href: '/cliente', label: 'Inicio', icon: 'Home', mobile: true },
    { href: '/cliente/credito', label: 'Mi crédito', icon: 'Landmark', mobile: true },
    { href: '/cliente/decidir', label: 'Decidir', icon: 'Calculator', mobile: true },
    { href: '/cliente/vivienda', label: 'Mi vivienda', icon: 'House' },
    { href: '/cliente/gestiones', label: 'Gestiones', icon: 'ClipboardCheck', mobile: true },
    { href: '/cliente/documentos', label: 'Documentos', icon: 'FileText' },
    { href: '/cliente/ayuda', label: 'Ayuda', icon: 'LifeBuoy', mobile: true },
  ],
  aliado: [
    { href: '/aliado', label: 'Resumen', icon: 'Home', mobile: true },
    { href: '/aliado/clientes', label: 'Clientes', icon: 'Users', mobile: true },
    { href: '/aliado/embudo', label: 'Embudo', icon: 'Filter' },
    { href: '/aliado/agenda', label: 'Agenda', icon: 'CalendarDays', mobile: true },
    { href: '/aliado/comisiones', label: 'Comisiones', icon: 'Wallet', mobile: true },
    { href: '/aliado/academia', label: 'Academia', icon: 'GraduationCap', mobile: true },
    { href: '/aliado/equipo', label: 'Equipo', icon: 'UsersRound', permission: 'case.assign' },
  ],
  empresa: [
    { href: '/empresa', label: 'Operación', icon: 'Home', mobile: true, group: 'Operación' },
    { href: '/empresa/bandeja', label: 'Bandeja', icon: 'Inbox', permission: 'case.read', mobile: true, group: 'Operación' },
    { href: '/empresa/leads', label: 'Leads web', icon: 'Megaphone', permission: 'lead.manage', group: 'Operación' },
    { href: '/empresa/clientes', label: 'Clientes', icon: 'Users', permission: 'person.read', group: 'Operación' },
    { href: '/empresa/documentos', label: 'Documentos', icon: 'FileCheck', permission: 'doc.review', group: 'Operación' },
    { href: '/empresa/pagos', label: 'Pagos', icon: 'Receipt', permission: 'payment.review', group: 'Posventa' },
    { href: '/empresa/solicitudes', label: 'Solicitudes', icon: 'MessagesSquare', permission: 'request.manage', mobile: true, group: 'Posventa' },
    { href: '/empresa/aliados', label: 'Aliados', icon: 'Handshake', permission: 'ally.manage', group: 'Red' },
    { href: '/empresa/comisiones', label: 'Comisiones', icon: 'Wallet', permission: 'commission.approve', group: 'Red' },
    { href: '/empresa/analitica', label: 'Analítica', icon: 'ChartColumn', permission: 'analytics.read', mobile: true, group: 'Control' },
    { href: '/empresa/auditoria', label: 'Auditoría', icon: 'ShieldCheck', permission: 'audit.read', group: 'Control' },
    { href: '/empresa/catalogos', label: 'Entidades y reglas', icon: 'Settings2', permission: 'catalog.manage', group: 'Administración' },
    { href: '/empresa/usuarios', label: 'Usuarios', icon: 'UserCog', permission: 'user.manage', group: 'Administración' },
  ],
};
