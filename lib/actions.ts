import './zod-es';
import { z } from 'zod';
import type { ActionState } from '@/components/ov/forms';
import type { Prisma } from '@/app/generated/prisma/client';
import { getPrisma } from './prisma';
import type { Permission } from './security/rbac';
import { assertPermission, type CurrentSession } from './security/session';
import { requestMeta, type RequestMeta } from './security/request';

export class UserError extends Error {}

export function ok(message: string): ActionState {
  return { ok: true, message, at: Date.now() };
}

export function fail(message: string): ActionState {
  return { ok: false, message, at: Date.now() };
}

/**
 * Envoltorio de TODA acción de servidor privada: verifica sesión + MFA +
 * permiso, valida la entrada con zod y convierte errores en mensajes
 * seguros (nunca se filtran trazas ni detalles internos al navegador).
 */
export function secureAction<S extends z.ZodType>(
  permission: Permission,
  schema: S,
  handler: (input: z.infer<S>, ctx: { session: CurrentSession; meta: RequestMeta }) => Promise<ActionState>,
) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    let session: CurrentSession;
    try {
      session = await assertPermission(permission);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Sesión no válida.');
    }
    const raw: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('$ACTION')) continue;
      if (key in raw) {
        const current = raw[key];
        raw[key] = Array.isArray(current) ? [...current, value] : [current, value];
      } else raw[key] = value;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
    try {
      return await handler(parsed.data, { session, meta: await requestMeta() });
    } catch (error) {
      if (error instanceof UserError) return fail(error.message);
      console.error('Acción fallida', { permission, error: error instanceof Error ? error.message : 'desconocido' });
      return fail('No pudimos completar la acción. Inténtalo de nuevo.');
    }
  };
}

// ── Esquemas reutilizables ──────────────────────────────────────────────

export const zText = (max: number, min = 1, message = 'Completa este campo.') => z.string().trim().min(min, message).max(max);
/*
 * Con zod 4 un `optional().transform().pipe()` deja de ser opcional como clave
 * de objeto: si el campo no llega en el FormData falla con "expected
 * nonoptional". Por eso los campos opcionales se normalizan con `preprocess`
 * y terminan en `.optional()`.
 */
export const zOptText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() || undefined : v), z.string().max(max).optional());
export const zId = z.string().uuid('Identificador inválido.');
/** Pesos escritos con o sin puntos: "4.500.000" → 4500000. */
export const zMoney = z
  .union([z.string(), z.number()])
  .transform((v) => Number(String(v).replace(/[^\d]/g, '')))
  .pipe(z.number().int().nonnegative().max(1e13, 'Valor demasiado grande.'));
export const zOptMoney = z.preprocess(
  (v) => (v === undefined || v === null || String(v).trim() === '' ? undefined : Number(String(v).replace(/[^\d]/g, ''))),
  z.number().int().nonnegative().max(1e13).optional(),
);
/** Porcentaje escrito "12,5" o "12.5" → 0.125. */
export const zPercent = z
  .union([z.string(), z.number()])
  .transform((v) => Number(String(v).replace(',', '.')) / 100)
  .pipe(z.number().min(0).max(1, 'Porcentaje fuera de rango.'));
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.');
export const zCheckbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

// ── Consecutivos ───────────────────────────────────────────────────────

/** Consecutivo atómico: OV-1001, SOL-1001… */
export async function nextCode(prefix: string, tx?: Prisma.TransactionClient): Promise<string> {
  const db = tx ?? getPrisma();
  const rows = await db.$queryRaw<Array<{ value: number }>>`
    INSERT INTO counters (key, value) VALUES (${prefix}, 1001)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value`;
  return `${prefix}-${rows[0].value}`;
}
