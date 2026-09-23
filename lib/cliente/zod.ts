import { z } from 'zod';
import { zId } from '@/lib/actions';

/**
 * Id opcional: acepta campo ausente o vacío. Con zod 4, un `.optional()` al
 * inicio de un pipe NO vuelve opcional la clave del objeto si el campo no
 * viene en el formulario; `preprocess` sí.
 */
export const zOptId = z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v : undefined), zId.optional());

/** Entero opcional escrito en un campo de texto. */
export const zOptInt = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : undefined),
    z.number({ error: message }).int(message).min(min, message).max(max, message).optional(),
  );

/** Decimal opcional ("72,5"). */
export const zOptDecimal = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : undefined),
    z.number({ error: message }).positive(message).max(max, message).optional(),
  );

/** Texto opcional robusto a la ausencia de la clave. */
export const zMaybeText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined), z.string().max(max).optional());

/** Porcentaje opcional ("30" → 0.3). */
export const zOptPct = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) / 100 : undefined),
  z.number().min(0).max(1).optional(),
);

/** Monto opcional ("1.200.000"). */
export const zOptPesos = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[^\d]/g, '')) : undefined),
  z.number().int().nonnegative().max(1e13).optional(),
);

/** Casilla: marcada = true; ausente = false. (El `zCheckbox` compartido falla con zod 4 cuando la casilla no se envía.) */
export const zCheck = z.preprocess((v) => v === 'on' || v === 'true', z.boolean());
