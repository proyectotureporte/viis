import { beforeAll, describe, expect, it } from 'vitest';
import { auditHash, canonicalJson, GENESIS_HASH } from '@/lib/security/audit';
import { can, caseScope, portalFor, ROLE_PERMISSIONS } from '@/lib/security/rbac';

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba';
});

describe('bitácora encadenada', () => {
  it('JSON canónico ignora el orden de claves (jsonb las reordena)', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
  });

  it('cualquier cambio rompe el hash', () => {
    const event = { at: '2026-09-23T00:00:00.000Z', action: 'case.created', entity: 'Opportunity', entityId: 'x', after: { code: 'OV-1001' } };
    const h1 = auditHash(GENESIS_HASH, event);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(auditHash(GENESIS_HASH, { ...event, after: { code: 'OV-1002' } })).not.toBe(h1);
    expect(auditHash('1'.repeat(64), event)).not.toBe(h1);
  });
});

describe('matriz de permisos', () => {
  it('mínimo privilegio', () => {
    expect(can('CLIENT', 'payment.report')).toBe(true);
    expect(can('CLIENT', 'case.read')).toBe(false);
    expect(can('ALLY', 'doc.review')).toBe(false);
    expect(can('ALLY', 'commission.approve')).toBe(false);
    expect(can('TREASURY', 'commission.pay')).toBe(true);
    expect(can('ADVISOR', 'commission.pay')).toBe(false);
    expect(can('COMPLIANCE', 'audit.read')).toBe(true);
    expect(can('DOC_ANALYST', 'user.manage')).toBe(false);
  });

  it('solo ADMIN gestiona usuarios y catálogos', () => {
    const roles = Object.entries(ROLE_PERMISSIONS).filter(([, perms]) => perms.includes('user.manage')).map(([r]) => r);
    expect(roles).toEqual(['ADMIN']);
  });

  it('portales y alcance de casos', () => {
    expect(portalFor('CLIENT')).toBe('cliente');
    expect(portalFor('ALLY_ADMIN')).toBe('aliado');
    expect(portalFor('TREASURY')).toBe('empresa');
    expect(caseScope({ id: 'u1', role: 'ALLY', organizationId: 'o1' })).toEqual({ allyUserId: 'u1' });
    expect(caseScope({ id: 'u1', role: 'ALLY_ADMIN', organizationId: 'o1' })).toEqual({ allyOrgId: 'o1' });
    expect(caseScope({ id: 'u1', role: 'ADMIN', organizationId: null })).toEqual({});
  });
});
