/**
 * Matemática de crédito hipotecario, sistema francés (cuota fija).
 *
 * Verificado el 2026-09-04 contra las cifras publicadas en la investigación
 * de la tasa del 8% del 2026-09-02: reproduce exacto 28,3% / 32,9% / 36,1%
 * de reducción de cuota a 15/20/25 años, $803.520 de ahorro mensual y
 * $192,8M en la vida de un crédito de $200M a 20 años, y 49,0% más
 * capacidad de compra a igual cuota.
 *
 * Módulo puro y sin dependencias a propósito: es el único punto de la página
 * donde un error se convierte en una cifra falsa frente a un cliente.
 */

export interface Comparacion {
  cuotaActual: number;
  cuotaOferta: number;
  ahorroMensual: number;
  ahorroTotal: number;
  reduccionPorcentaje: number;
  capacidadExtraPorcentaje: number;
}

/** Convierte una tasa efectiva anual a su equivalente efectiva mensual. */
export function tasaMensual(ea: number): number {
  if (ea === 0) return 0;
  return Math.pow(1 + ea, 1 / 12) - 1;
}

/** Cuota fija del sistema francés: P·i / (1 − (1+i)^−n). */
export function cuotaMensual(capital: number, ea: number, anios: number): number {
  const n = anios * 12;
  const i = tasaMensual(ea);
  if (i === 0) return capital / n;
  return (capital * i) / (1 - Math.pow(1 + i, -n));
}

/**
 * Factor de anualidad: cuánto capital financia UNA unidad de cuota.
 * Sirve para responder "cuánta más casa compra la misma cuota".
 */
function factorAnualidad(ea: number, anios: number): number {
  const n = anios * 12;
  const i = tasaMensual(ea);
  if (i === 0) return n;
  return (1 - Math.pow(1 + i, -n)) / i;
}

/**
 * En cuántos MESES se termina de pagar un capital a cierta tasa si se
 * mantiene una cuota fija dada. Despeja n de la fórmula de la anualidad:
 *   n = −ln(1 − P·i / cuota) / ln(1 + i)
 *
 * Sirve para la pregunta que de verdad le importa a quien ya tiene crédito:
 * *"si consigo el 8% y sigo pagando lo mismo que hoy, ¿cuándo termino?"*.
 * Reemplazó al "X% más casa", que empujaba a endeudarse más y contradecía la
 * advertencia de sobrecarga que la misma página hace dos secciones abajo.
 *
 * Devuelve Infinity cuando la cuota no cubre ni los intereses del periodo:
 * ahí la deuda no baja nunca y hay que decirlo, no dibujar un número.
 */
export function mesesConCuota(capital: number, ea: number, cuota: number): number {
  if (cuota <= 0) return Infinity;
  const i = tasaMensual(ea);
  if (i === 0) return capital / cuota;
  const interesDelPrimerMes = capital * i;
  if (cuota <= interesDelPrimerMes) return Infinity;
  return -Math.log(1 - interesDelPrimerMes / cuota) / Math.log(1 + i);
}

/** Cuánto más capital compra la misma cuota al pasar de una tasa a otra, en %. */
export function capacidadExtra(eaActual: number, eaOferta: number, anios: number): number {
  return (factorAnualidad(eaOferta, anios) / factorAnualidad(eaActual, anios) - 1) * 100;
}

export function compararTasas(
  capital: number,
  eaActual: number,
  eaOferta: number,
  anios: number,
): Comparacion {
  const cuotaActual = cuotaMensual(capital, eaActual, anios);
  const cuotaOferta = cuotaMensual(capital, eaOferta, anios);
  const ahorroMensual = cuotaActual - cuotaOferta;
  return {
    cuotaActual,
    cuotaOferta,
    ahorroMensual,
    ahorroTotal: ahorroMensual * anios * 12,
    reduccionPorcentaje: cuotaActual === 0 ? 0 : (ahorroMensual / cuotaActual) * 100,
    capacidadExtraPorcentaje: capacidadExtra(eaActual, eaOferta, anios),
  };
}
