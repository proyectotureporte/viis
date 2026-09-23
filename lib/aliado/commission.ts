import { pct } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import type { SessionUser } from '@/lib/security/session';
import { commissionScope } from './scope';

/**
 * Lectura del `ruleSnapshot` guardado al causar la comisión. Es la foto de la
 * regla vigente en ese momento: los cambios posteriores no la alteran.
 */
export interface RuleSnapshot {
  name: string;
  version: number | null;
  percent: number | null;
  withholdingPct: number | null;
  basis: string | null;
  paymentDays: number | null;
  validFrom: string | null;
  validTo: string | null;
  scope: string;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function readSnapshot(json: unknown): RuleSnapshot {
  const s = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
  const scope = s.organizationId ? 'Acordada con tu organización' : s.tier ? `Nivel ${String(s.tier)}` : 'General para aliados';
  return {
    name: str(s.name) ?? 'Regla sin nombre',
    version: num(s.version),
    percent: num(s.percent),
    withholdingPct: num(s.withholdingPct),
    basis: str(s.basis),
    paymentDays: num(s.paymentDays),
    validFrom: str(s.validFrom),
    validTo: str(s.validTo),
    scope,
  };
}

export const BASIS_LABELS: Record<string, string> = {
  DISBURSED: 'Monto desembolsado',
};

export function ratePct(value: number | null, decimals = 2): string {
  return value === null ? '—' : pct(value, decimals);
}

/** Comisiones del alcance del aliado con lo necesario para reconstruirlas. */
export async function scopedCommissions(user: Pick<SessionUser, 'id' | 'role' | 'organizationId'>, take = 1000) {
  return getPrisma().commission.findMany({
    where: commissionScope(user),
    orderBy: { causedAt: 'desc' },
    take,
    include: {
      allyUser: { select: { name: true } },
      opportunity: {
        select: {
          id: true,
          code: true,
          product: true,
          disbursedAmount: true,
          person: { select: { firstName: true, lastName: true } },
          entity: { select: { name: true } },
          stages: { where: { to: 'DISBURSED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      },
    },
  });
}
