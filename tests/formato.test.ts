import { describe, expect, it } from 'vitest';
import { milesTexto, pesos, porcentaje, soloDigitos } from '@/lib/formato';

describe('pesos', () => {
  it('usa punto como separador de miles y no muestra decimales', () => {
    expect(pesos(2_441_820)).toBe('$2.441.820');
    expect(pesos(803_520)).toBe('$803.520');
    expect(pesos(192_844_801)).toBe('$192.844.801');
  });

  it('redondea al peso', () => {
    expect(pesos(1_638_299.6)).toBe('$1.638.300');
  });

  it('maneja cifras pequeñas sin separador', () => {
    expect(pesos(0)).toBe('$0');
    expect(pesos(999)).toBe('$999');
    expect(pesos(1000)).toBe('$1.000');
  });

  it('maneja negativos', () => {
    expect(pesos(-1_500_000)).toBe('-$1.500.000');
  });
});

describe('porcentaje', () => {
  it('usa COMA como separador decimal, que es lo correcto en Colombia', () => {
    expect(porcentaje(32.92, 1)).toBe('32,9');
    expect(porcentaje(28.33, 1)).toBe('28,3');
    expect(porcentaje(36.15, 1)).toBe('36,1');
  });

  it('sin decimales no deja coma colgando', () => {
    expect(porcentaje(49.04, 0)).toBe('49');
  });

  it('respeta dos decimales para la tasa', () => {
    expect(porcentaje(14.58, 2)).toBe('14,58');
  });
});

describe('milesTexto', () => {
  it('separa miles con punto y sin signo de pesos', () => {
    expect(milesTexto(4_200_000)).toBe('4.200.000');
    expect(milesTexto(200_000_000)).toBe('200.000.000');
  });

  it('nunca deja un cero a la izquierda', () => {
    // El bug real: el campo arrancaba en 0 y al escribir encima quedaba "04200000".
    expect(milesTexto(0)).toBe('');
    expect(milesTexto(4_200_000).startsWith('0')).toBe(false);
  });

  it('cifras cortas no llevan separador', () => {
    expect(milesTexto(999)).toBe('999');
    expect(milesTexto(1000)).toBe('1.000');
  });
});

describe('soloDigitos', () => {
  it('deja solo digitos', () => {
    expect(soloDigitos('4.200.000')).toBe(4_200_000);
    expect(soloDigitos('$ 4.200.000 pesos')).toBe(4_200_000);
  });

  it('cadena vacia o sin digitos devuelve 0', () => {
    expect(soloDigitos('')).toBe(0);
    expect(soloDigitos('abc')).toBe(0);
  });

  it('descarta ceros a la izquierda al interpretar', () => {
    expect(soloDigitos('04200000')).toBe(4_200_000);
  });
});
