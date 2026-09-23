import { describe, expect, it } from 'vitest';
import { allowedTransitions, computeCommission, pickRule } from '@/lib/domain/cases';

type Rule = Parameters<typeof pickRule>[0][number];

function rule(partial: Partial<Rule>): Rule {
  return {
    id: Math.random().toString(36),
    name: 'regla',
    organizationId: null,
    tier: null,
    product: null,
    basis: 'DISBURSED',
    percent: { toString: () => '0.01' } as never,
    withholdingPct: { toString: () => '0' } as never,
    paymentDays: 30,
    version: 1,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: null,
    active: true,
    createdById: null,
    createdAt: new Date(),
    ...partial,
  } as Rule;
}

describe('motor de etapas', () => {
  it('avanza, retrocede un paso o desiste', () => {
    expect(allowedTransitions('DOCUMENTING')).toEqual(['FILED', 'PROFILED', 'WITHDRAWN']);
    expect(allowedTransitions('LEAD')).toEqual(['CONTACTED', 'WITHDRAWN']);
    expect(allowedTransitions('DISBURSED')).toEqual(['POSTSALE']);
    expect(allowedTransitions('WITHDRAWN')).toEqual(['LEAD']);
  });
});

describe('comisiones', () => {
  const org = { id: 'org-1', tier: 'PLATA' };
  const on = new Date('2026-09-23T12:00:00Z');

  it('elige la regla más específica y la versión más alta', () => {
    const general = rule({ name: 'general' });
    const tier = rule({ name: 'tier', tier: 'PLATA' });
    const orgRule = rule({ name: 'org', organizationId: 'org-1' });
    const orgV2 = rule({ name: 'org-v2', organizationId: 'org-1', version: 2 });
    const product = rule({ name: 'producto', tier: 'PLATA', product: 'PORTFOLIO_PURCHASE' });
    expect(pickRule([general, tier], org, 'NEW_LOAN', on)?.name).toBe('tier');
    expect(pickRule([general, tier, orgRule, orgV2], org, 'NEW_LOAN', on)?.name).toBe('org-v2');
    expect(pickRule([general, tier, product], org, 'PORTFOLIO_PURCHASE', on)?.name).toBe('producto');
  });

  it('respeta vigencias y reglas inactivas', () => {
    const expired = rule({ name: 'vieja', validTo: new Date('2026-06-30T00:00:00Z') });
    const future = rule({ name: 'futura', validFrom: new Date('2026-12-01T00:00:00Z') });
    const inactive = rule({ name: 'inactiva', active: false });
    const otherOrg = rule({ name: 'otra', organizationId: 'org-2' });
    expect(pickRule([expired, future, inactive, otherOrg], org, 'NEW_LOAN', on)).toBeNull();
    // La regla vigente cuando se creó el caso protege el negocio aunque luego venza.
    expect(pickRule([expired], org, 'NEW_LOAN', new Date('2026-05-10T00:00:00Z'))?.name).toBe('vieja');
  });

  it('cálculo reconstruible: base × % − retención', () => {
    expect(computeCommission(284_000_000, 0.015, 0.11)).toEqual({ gross: 4_260_000, withholding: 468_600, net: 3_791_400 });
  });
});
