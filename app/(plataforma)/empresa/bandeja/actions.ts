'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zOptText } from '@/lib/actions';
import { assertCaseInScope } from '@/lib/empresa/access';
import { assignCase, escalateCase } from '@/lib/empresa/cases';
import { getPrisma } from '@/lib/prisma';
import { can } from '@/lib/security/rbac';

const ids = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(z.array(z.string().uuid('Selección inválida.')).max(100, 'Máximo 100 casos por operación.'));

const schema = z.object({
  op: z.string().regex(/^(bulk-assign|bulk-escalate|take:[0-9a-f-]{36})$/, 'Operación inválida.'),
  ids,
  assigneeId: z.string().optional().transform((v) => (v === 'none' ? null : v || undefined)).pipe(z.string().uuid().nullable().optional()),
  reason: zOptText(300),
});

/**
 * Operaciones de la bandeja: asignación masiva (case.assign), escalamiento
 * masivo con motivo (case.stage) y "tomar" un caso sin responsable (case.stage).
 * Cada caso se revalida contra el alcance del usuario.
 */
export const bandejaAction = secureAction('case.read', schema, async (input, { session, meta }) => {
  const ctx = { actor: session.user, meta };
  const prisma = getPrisma();

  if (input.op.startsWith('take:')) {
    if (!can(session.user.role, 'case.stage')) throw new UserError('No tienes permiso para tomar casos.');
    const id = input.op.slice(5);
    const code = await prisma.$transaction(async (tx) => {
      await assertCaseInScope(session, id, tx);
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id }, select: { code: true, assigneeId: true } });
      if (opp.assigneeId && opp.assigneeId !== session.user.id) throw new UserError(`${opp.code} ya tiene responsable.`);
      await assignCase(tx, id, session.user.id, ctx);
      return opp.code;
    });
    revalidatePath('/empresa/bandeja');
    return ok(`Tomaste el caso ${code}.`);
  }

  if (!input.ids.length) throw new UserError('Selecciona al menos un caso.');

  if (input.op === 'bulk-assign') {
    if (!can(session.user.role, 'case.assign')) throw new UserError('No tienes permiso para asignar casos.');
    if (input.assigneeId === undefined) throw new UserError('Elige el responsable.');
    const changed = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const id of input.ids) {
        await assertCaseInScope(session, id, tx);
        if (await assignCase(tx, id, input.assigneeId ?? null, ctx)) n += 1;
      }
      return n;
    });
    revalidatePath('/empresa/bandeja');
    return ok(changed ? `${changed} caso(s) ${input.assigneeId ? 'asignados' : 'quedaron sin responsable'}.` : 'Los casos ya tenían ese responsable.');
  }

  if (!can(session.user.role, 'case.stage')) throw new UserError('No tienes permiso para escalar casos.');
  if (!input.reason || input.reason.length < 5) throw new UserError('Escribe el motivo del escalamiento (mínimo 5 caracteres).');
  await prisma.$transaction(async (tx) => {
    for (const id of input.ids) {
      await assertCaseInScope(session, id, tx);
      await escalateCase(tx, id, input.reason!, ctx);
    }
  });
  revalidatePath('/empresa/bandeja');
  return ok(`${input.ids.length} caso(s) escalados. Coordinación fue notificada.`);
});
