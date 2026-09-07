/** Espacio duro: une dos palabras para que nunca se separen al saltar de línea. */
const ESPACIO_DURO = '\u00A0';

/**
 * Evita la "palabra huérfana": esa última palabra corta que queda sola en el
 * renglón final de un título y deja el bloque cojo.
 *
 * Audité los títulos del sitio y **14 terminaban en palabras de 2 a 6 letras**
 * — "ti", "vez", "más", "8%", "RUD", "pasó", "solo" —, que son justo las que
 * quedan colgando. `text-wrap: balance` ayuda pero no lo garantiza en todos
 * los anchos; el espacio duro sí, porque el navegador ya no puede partir ahí.
 *
 * Se aplica al RENDERIZAR, no en `content/sitio.ts`: así el contenido se
 * mantiene limpio, buscable y sin caracteres invisibles que confundan a quien
 * lo edite.
 */
export function sinHuerfanas(texto: string): string {
  const limpio = texto.trim();
  const partes = limpio.split(/\s+/);
  if (partes.length < 2) return limpio;
  const ultima = partes.pop() as string;
  return `${partes.join(' ')}${ESPACIO_DURO}${ultima}`;
}
