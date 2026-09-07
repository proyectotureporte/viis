import { describe, expect, it } from 'vitest';
import { faseActual, FIN_VENTANA } from '@/lib/fase';

describe('la fase de la página', () => {
  it('está en ventana mientras el plazo del seguro siga vivo', () => {
    expect(faseActual(new Date('2026-09-04T09:00:00'))).toBe('ventana');
    expect(faseActual(new Date('2026-10-31T23:00:00'))).toBe('ventana');
    expect(faseActual(new Date('2026-11-07T23:59:00'))).toBe('ventana');
  });

  it('pasa a permanente el día que vence, no antes', () => {
    expect(faseActual(new Date('2026-11-08T00:01:00'))).toBe('permanente');
    expect(faseActual(new Date('2026-12-01T09:00:00'))).toBe('permanente');
    expect(faseActual(new Date('2027-06-15T09:00:00'))).toBe('permanente');
  });

  it('el fin de la ventana coincide con el plazo del seguro', () => {
    expect(FIN_VENTANA.getFullYear()).toBe(2026);
    expect(FIN_VENTANA.getMonth()).toBe(10); // noviembre
    expect(FIN_VENTANA.getDate()).toBe(8);
  });

  it('no depende de la hora: todo el 7-nov es ventana, todo el 8 es permanente', () => {
    for (const h of ['00:01', '09:00', '23:59']) {
      expect(faseActual(new Date(`2026-11-07T${h}:00`))).toBe('ventana');
      expect(faseActual(new Date(`2026-11-08T${h}:00`))).toBe('permanente');
    }
  });
});
