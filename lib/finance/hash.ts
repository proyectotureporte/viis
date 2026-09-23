/**
 * Huella reproducible de los datos de entrada de una simulación.
 *
 * JSON canónico: claves de objetos ordenadas, `undefined` omitido, números
 * no finitos escritos como texto ("Infinity", "NaN"). Dos entradas con los
 * mismos datos producen el mismo hash sin importar el orden de las claves.
 *
 * Usa node:crypto: importar solo desde código de servidor.
 */

import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined || typeof v === 'function' ? 'null' : canonicalJson(v))).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new TypeError(`Tipo no serializable en JSON canónico: ${typeof value}`);
}

/** SHA-256 en hexadecimal del JSON canónico. */
export function canonicalInputsHash(obj: unknown): string {
  return createHash('sha256').update(canonicalJson(obj), 'utf8').digest('hex');
}
