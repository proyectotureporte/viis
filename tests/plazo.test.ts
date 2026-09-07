import { describe, expect, it } from 'vitest';
import { estadoDelPlazo, TOTAL_DIAS_AVISO } from '@/lib/plazo';

describe('el plazo del seguro', () => {
  it('la ventana completa es de 90 días', () => {
    // Del sismo (10-ago-2026) al último día para avisar (~8-nov-2026).
    expect(TOTAL_DIAS_AVISO).toBe(90);
  });

  it('SE ACTUALIZA SEGÚN EL DÍA: cada fecha da un número distinto', () => {
    const dias = (f: string) => estadoDelPlazo(new Date(f + 'T09:00:00')).diasRestantes;
    expect(dias('2026-09-04')).toBe(65);
    expect(dias('2026-09-05')).toBe(64);
    expect(dias('2026-10-01')).toBe(38);
    expect(dias('2026-11-01')).toBe(7);
    // Un día después siempre queda exactamente un día menos.
    expect(dias('2026-09-20') - dias('2026-09-21')).toBe(1);
  });

  it('marca vencido el día del plazo y después, no antes', () => {
    expect(estadoDelPlazo(new Date('2026-11-07T09:00:00')).vencido).toBe(false);
    expect(estadoDelPlazo(new Date('2026-11-08T09:00:00')).vencido).toBe(true);
    expect(estadoDelPlazo(new Date('2026-12-01T09:00:00')).vencido).toBe(true);
  });

  it('el avance va de 0% el día del sismo a 100% al vencer', () => {
    expect(estadoDelPlazo(new Date('2026-08-10T00:00:00')).avance).toBeCloseTo(0, 1);
    expect(estadoDelPlazo(new Date('2026-11-08T00:00:00')).avance).toBeCloseTo(100, 1);
  });

  it('el avance nunca se sale de 0–100, ni antes del sismo ni mucho después', () => {
    expect(estadoDelPlazo(new Date('2026-01-01T09:00:00')).avance).toBe(0);
    expect(estadoDelPlazo(new Date('2027-06-01T09:00:00')).avance).toBe(100);
  });
});

describe('el contador no depende de la hora del día', () => {
  it('a las 9am y a las 11pm del MISMO día da el mismo número', () => {
    const manana = estadoDelPlazo(new Date('2026-09-04T09:00:00')).diasRestantes;
    const noche = estadoDelPlazo(new Date('2026-09-04T23:30:00')).diasRestantes;
    const madrugada = estadoDelPlazo(new Date('2026-09-04T00:01:00')).diasRestantes;
    expect(manana).toBe(noche);
    expect(manana).toBe(madrugada);
    expect(manana).toBe(65);
  });
});
