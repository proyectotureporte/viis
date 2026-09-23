import type { Role } from '@/app/generated/prisma/enums';

/**
 * Matriz de permisos del lado del servidor. Es la ÚNICA fuente de verdad:
 * la interfaz solo oculta botones, pero cada acción y ruta vuelve a
 * preguntar aquí antes de tocar datos.
 */
export const PERMISSIONS = [
  'case.create',
  'case.read',
  'case.assign',
  'case.stage',
  'case.note',
  'offer.manage',
  'lead.manage',
  'person.create',
  'person.read',
  'doc.upload',
  'doc.review',
  'payment.report',
  'payment.review',
  'loan.manage',
  'request.create',
  'request.manage',
  'commission.read',
  'commission.rules',
  'commission.approve',
  'commission.pay',
  'academy.take',
  'academy.manage',
  'ally.manage',
  'user.manage',
  'catalog.manage',
  'audit.read',
  'analytics.read',
  'consent.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF_BASE: Permission[] = ['case.read', 'case.note', 'person.read', 'doc.upload', 'academy.take'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CLIENT: ['payment.report', 'request.create', 'doc.upload'],
  ALLY: ['case.create', 'case.read', 'case.note', 'person.create', 'person.read', 'doc.upload', 'commission.read', 'academy.take'],
  ALLY_ADMIN: ['case.create', 'case.read', 'case.note', 'case.assign', 'person.create', 'person.read', 'doc.upload', 'commission.read', 'academy.take'],
  ADVISOR: [...STAFF_BASE, 'case.create', 'case.stage', 'offer.manage', 'lead.manage', 'person.create', 'loan.manage', 'request.manage'],
  DOC_ANALYST: [...STAFF_BASE, 'doc.review', 'case.stage'],
  FIN_ANALYST: [...STAFF_BASE, 'offer.manage', 'case.stage', 'loan.manage'],
  COORDINATOR: [...STAFF_BASE, 'case.create', 'case.assign', 'case.stage', 'offer.manage', 'lead.manage', 'person.create', 'doc.review', 'request.manage', 'loan.manage', 'payment.review', 'analytics.read', 'commission.approve', 'ally.manage'],
  POSTSALE: [...STAFF_BASE, 'payment.review', 'request.manage', 'loan.manage', 'case.stage'],
  TREASURY: [...STAFF_BASE, 'commission.approve', 'commission.pay', 'payment.review'],
  COMPLIANCE: [...STAFF_BASE, 'audit.read', 'consent.manage', 'analytics.read'],
  ADMIN: [...PERMISSIONS],
  DIRECTOR: [...STAFF_BASE, 'analytics.read', 'audit.read', 'commission.rules', 'commission.approve'],
};

export const ROLE_LABELS: Record<Role, string> = {
  CLIENT: 'Cliente',
  ALLY: 'Aliado',
  ALLY_ADMIN: 'Aliado empresa (administrador)',
  ADVISOR: 'Asesor comercial',
  DOC_ANALYST: 'Analista documental',
  FIN_ANALYST: 'Analista financiero',
  COORDINATOR: 'Coordinación',
  POSTSALE: 'Posventa',
  TREASURY: 'Tesorería',
  COMPLIANCE: 'Cumplimiento y datos',
  ADMIN: 'Administrador',
  DIRECTOR: 'Dirección',
};

export const STAFF_ROLES: Role[] = ['ADVISOR', 'DOC_ANALYST', 'FIN_ANALYST', 'COORDINATOR', 'POSTSALE', 'TREASURY', 'COMPLIANCE', 'ADMIN', 'DIRECTOR'];
export const ALLY_ROLES: Role[] = ['ALLY', 'ALLY_ADMIN'];

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export type Portal = 'cliente' | 'aliado' | 'empresa';

export function portalFor(role: Role): Portal {
  if (role === 'CLIENT') return 'cliente';
  if (ALLY_ROLES.includes(role)) return 'aliado';
  return 'empresa';
}

/** Filtro de alcance de casos por rol (mínimo privilegio). */
export function caseScope(user: { id: string; role: Role; organizationId: string | null }) {
  switch (user.role) {
    case 'ALLY':
      return { allyUserId: user.id };
    case 'ALLY_ADMIN':
      return { allyOrgId: user.organizationId ?? '00000000-0000-0000-0000-000000000000' };
    case 'ADVISOR':
      return { OR: [{ assigneeId: user.id }, { assigneeId: null }] };
    case 'CLIENT':
      return { person: { userId: user.id } };
    default:
      return {};
  }
}
