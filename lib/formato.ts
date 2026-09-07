/**
 * Formato de números en convención colombiana, hecho a mano a propósito.
 *
 * Dos razones para no usar toLocaleString ni toFixed:
 *  1. `toFixed` siempre escribe el decimal con PUNTO ("32.9"), y en Colombia
 *     el separador decimal es la coma. Quedaba contradictorio al lado de
 *     "$803.520", donde el punto separa miles.
 *  2. `toLocaleString` depende del ICU de Node en el build y del navegador en
 *     la hidratación. Si difieren, React reporta un desajuste de hidratación.
 *     Un formateador determinístico no puede desincronizarse.
 */

/** Inserta el punto de miles cada tres dígitos. */
function conMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Pesos colombianos redondeados al peso: `$2.441.820`. */
export function pesos(valor: number): string {
  const redondeado = Math.round(valor);
  const signo = redondeado < 0 ? '-' : '';
  return `${signo}$${conMiles(String(Math.abs(redondeado)))}`;
}

/**
 * Número con separador de miles y SIN signo de pesos, para mostrar dentro de
 * un campo de formulario: `4.200.000`.
 *
 * Devuelve cadena vacía cuando el valor es 0, y esa es la parte importante:
 * el campo de ingreso arrancaba en 0 con `<input type="number">`, así que al
 * escribir encima quedaba **"04200000"** en pantalla. Con vacío, el
 * marcador de posición hace su trabajo y no hay cero que estorbe.
 */
export function milesTexto(valor: number): string {
  const redondeado = Math.round(valor);
  if (redondeado === 0) return '';
  const signo = redondeado < 0 ? '-' : '';
  return `${signo}${conMiles(String(Math.abs(redondeado)))}`;
}

/**
 * Lee lo que el usuario escribió en un campo de pesos y devuelve el número.
 * Descarta puntos, espacios, signos y cualquier letra, así que tolera que
 * peguen "$ 4.200.000" desde otro lado.
 */
export function soloDigitos(texto: string): number {
  const digitos = texto.replace(/\D/g, '');
  return digitos === '' ? 0 : Number(digitos);
}

/** Número con coma decimal, para porcentajes y tasas: `32,9` · `14,58` · `49`. */
export function porcentaje(valor: number, decimales: number): string {
  const fijo = valor.toFixed(decimales);
  const [entero, decimal] = fijo.split('.');
  const enteroConMiles = conMiles(entero.replace('-', ''));
  const signo = fijo.startsWith('-') ? '-' : '';
  return decimal ? `${signo}${enteroConMiles},${decimal}` : `${signo}${enteroConMiles}`;
}
