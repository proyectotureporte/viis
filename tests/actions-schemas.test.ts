import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zCheckbox, zMoney, zOptMoney, zOptText, zPercent } from '@/lib/actions';

const schema = z.object({ flag: zCheckbox, note: zOptText(50), extra: zOptMoney });

describe('esquemas de formulario', () => {
  it('campos ausentes (casilla sin marcar, texto u monto vacío)', () => {
    expect(schema.parse({})).toEqual({ flag: false, note: undefined, extra: undefined });
  });
  it('campos presentes', () => {
    expect(schema.parse({ flag: 'on', note: ' hola ', extra: '4.500.000' })).toEqual({ flag: true, note: 'hola', extra: 4_500_000 });
    expect(schema.parse({ note: '', extra: '' })).toEqual({ flag: false, note: undefined, extra: undefined });
  });
  it('montos y porcentajes', () => {
    expect(zMoney.parse('$ 2.847.000')).toBe(2_847_000);
    expect(zPercent.parse('12,5')).toBeCloseTo(0.125);
  });
});
