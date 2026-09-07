import { describe, expect, it } from 'vitest';
import {
  capacidadExtra,
  compararTasas,
  cuotaMensual,
  mesesConCuota,
  tasaMensual,
} from '@/lib/credito';

const MERCADO = 0.1458; // E.A., promedio ponderado SFC, corte 10-jul-2026
const OFERTA = 0.08;
const CAPITAL = 200_000_000;

describe('tasaMensual', () => {
  it('convierte 8% E.A. a la mensual efectiva equivalente', () => {
    expect(tasaMensual(0.08)).toBeCloseTo(0.006434, 6);
  });

  it('devuelve 0 si la tasa es 0', () => {
    expect(tasaMensual(0)).toBe(0);
  });
});

describe('cuotaMensual', () => {
  it('calcula la cuota francesa de 200M a 20 años al 14,58%', () => {
    expect(Math.round(cuotaMensual(CAPITAL, MERCADO, 20))).toBe(2_441_820);
  });

  it('calcula la cuota de los mismos 200M al 8%', () => {
    expect(Math.round(cuotaMensual(CAPITAL, OFERTA, 20))).toBe(1_638_300);
  });

  it('con tasa 0 reparte el capital en cuotas iguales', () => {
    expect(cuotaMensual(1_200_000, 0, 1)).toBe(100_000);
  });
});

describe('compararTasas', () => {
  // Estas tres reducciones son el corazón del posicionamiento: la prensa
  // repite "más de 30%" y a 15 años NO se cumple. La página dice el número
  // correcto a propósito.
  it.each([
    [15, 28.3],
    [20, 32.9],
    [25, 36.1],
  ])('a %i años la cuota baja %f%%', (anios, esperado) => {
    const r = compararTasas(CAPITAL, MERCADO, OFERTA, anios);
    expect(r.reduccionPorcentaje).toBeCloseTo(esperado, 1);
  });

  it('el ahorro mensual a 20 años son 803.520 pesos', () => {
    const r = compararTasas(CAPITAL, MERCADO, OFERTA, 20);
    expect(Math.round(r.ahorroMensual)).toBe(803_520);
  });

  it('el ahorro en la vida del crédito a 20 años son 192,8 millones', () => {
    const r = compararTasas(CAPITAL, MERCADO, OFERTA, 20);
    expect(r.ahorroTotal / 1e6).toBeCloseTo(192.8, 1);
  });

  it('no reporta ahorro cuando la tasa actual ya es la de la oferta', () => {
    const r = compararTasas(CAPITAL, OFERTA, OFERTA, 20);
    expect(r.ahorroMensual).toBeCloseTo(0, 6);
    expect(r.reduccionPorcentaje).toBeCloseTo(0, 6);
  });
});

describe('capacidadExtra', () => {
  it('la misma cuota compra 49% más casa a 20 años', () => {
    expect(capacidadExtra(MERCADO, OFERTA, 20)).toBeCloseTo(49.0, 1);
  });
});

describe('mesesConCuota', () => {
  // Reemplaza al "X% más casa", que empujaba a endeudarse más y contradecía
  // la advertencia de sobrecarga de la propia página. Esta cifra va en la
  // dirección contraria: terminas de pagar ANTES.
  it.each([
    [15, 8.8],
    [20, 9.7],
    [25, 10.2],
  ])(
    'a %i años, pagando la misma cuota al 8%% se termina en %f años',
    (anios, esperado) => {
      const cuotaHoy = cuotaMensual(CAPITAL, MERCADO, anios);
      expect(mesesConCuota(CAPITAL, OFERTA, cuotaHoy) / 12).toBeCloseTo(esperado, 1);
    },
  );

  it('devuelve Infinity si la cuota no alcanza ni para los intereses', () => {
    // Una cuota ridícula nunca amortiza: la deuda crecería.
    expect(mesesConCuota(CAPITAL, OFERTA, 1000)).toBe(Infinity);
  });

  it('con tasa 0 el plazo es simplemente capital dividido cuota', () => {
    expect(mesesConCuota(1_200_000, 0, 100_000)).toBeCloseTo(12, 6);
  });
});
