import { describe, expect, it } from 'vitest';
import { sinHuerfanas } from '@/lib/tipografia';

const DURO = '\u00A0';

describe('sinHuerfanas', () => {
  it('une las dos últimas palabras con espacio duro', () => {
    expect(sinHuerfanas('Esto es exactamente lo que hacemos por ti')).toBe(
      `Esto es exactamente lo que hacemos por${DURO}ti`,
    );
  });

  it('respeta la puntuación final', () => {
    expect(sinHuerfanas('Cuéntanos qué te pasó')).toBe(`Cuéntanos qué te${DURO}pasó`);
    expect(sinHuerfanas('Hasta el desembolso están todos. Después quedas solo.')).toBe(
      `Hasta el desembolso están todos. Después quedas${DURO}solo.`,
    );
  });

  it('no toca textos de una sola palabra', () => {
    expect(sinHuerfanas('Calculadora')).toBe('Calculadora');
    expect(sinHuerfanas('')).toBe('');
  });

  it('solo introduce UN espacio duro, el último', () => {
    const r = sinHuerfanas('La ventana del 8%');
    expect(r.split(DURO)).toHaveLength(2);
    expect(r).toBe(`La ventana del${DURO}8%`);
  });

  it('es idempotente: aplicarlo dos veces no cambia nada', () => {
    const una = sinHuerfanas('Siento que me están cobrando de más');
    expect(sinHuerfanas(una)).toBe(una);
  });

  it('tolera espacios de sobra al final', () => {
    expect(sinHuerfanas('Ver el detalle   ')).toBe(`Ver el${DURO}detalle`);
  });
});
