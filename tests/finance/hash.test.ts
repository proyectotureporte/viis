import { describe, expect, it } from 'vitest';
import { amortize, canonicalInputsHash, canonicalJson, simulatePrepayment, type LoanState } from '@/lib/finance';

const loan: LoanState = {
  principal: 200_000_000,
  rateEa: 0.14,
  termMonths: 240,
  system: 'FIXED_PESOS',
  startDate: '2022-03-10',
  balance: 180_000_000,
  remainingMonths: 190,
  asOf: '2026-09-10',
};

describe('canonicalInputsHash', () => {
  it('es sha256 hex e ignora el orden de las claves y los undefined', () => {
    const a = canonicalInputsHash({ b: 1, a: { y: [1, 2], x: 'z' }, c: undefined });
    const b = canonicalInputsHash({ a: { x: 'z', y: [1, 2] }, b: 1 });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('cambia si cambia cualquier dato', () => {
    expect(canonicalInputsHash({ ...loan, rateEa: 0.1401 })).not.toBe(canonicalInputsHash(loan));
  });

  it('mismo input → mismo hash y mismos resultados', () => {
    const p = { amount: 10_000_000, date: '2027-01-01', mode: 'TERM' as const };
    const copia = JSON.parse(JSON.stringify({ loan, p }));
    expect(canonicalInputsHash({ loan, p })).toBe(canonicalInputsHash(copia));
    expect(simulatePrepayment(loan, p)).toEqual(simulatePrepayment(copia.loan, copia.p));
    expect(canonicalInputsHash(amortize(loan))).toBe(canonicalInputsHash(amortize(copia.loan)));
  });
});
