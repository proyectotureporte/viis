'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok } from '@/lib/actions';
import { zMaybeText, zOptPesos } from '@/lib/cliente/zod';
import { clientAction } from '@/lib/cliente/server';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { GOALS } from './goals';

const schema = z.object({
  goals: z.union([z.string(), z.array(z.string())]).optional(),
  goalsNote: zMaybeText(500),
  city: zMaybeText(120),
  monthlyIncome: zOptPesos,
  monthlyExpenses: zOptPesos,
  savings: zOptPesos,
});

export const saveHouseholdAction = clientAction(schema, async (input, { session, meta, person }) => {
  const picked = (Array.isArray(input.goals) ? input.goals : input.goals ? [input.goals] : []).filter((g) => GOALS.some((x) => x.code === g));
  const goalsText = [picked.map((code) => GOALS.find((g) => g.code === code)!.label).join('; '), input.goalsNote].filter(Boolean).join(' | ') || null;
  const data = {
    goals: goalsText,
    city: input.city ?? null,
    monthlyIncome: input.monthlyIncome !== undefined ? BigInt(input.monthlyIncome) : null,
    monthlyExpenses: input.monthlyExpenses !== undefined ? BigInt(input.monthlyExpenses) : null,
    savings: input.savings !== undefined ? BigInt(input.savings) : null,
  };
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.person.findUniqueOrThrow({ where: { id: person.id }, select: { goals: true, city: true, monthlyIncome: true, monthlyExpenses: true, savings: true } });
    await tx.person.update({ where: { id: person.id }, data });
    // Minimización: la bitácora registra QUÉ campos cambiaron, no los montos.
    const changed = (Object.keys(data) as Array<keyof typeof data>).filter((k) => String(before[k] ?? '') !== String(data[k] ?? ''));
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'person.household_updated', entity: 'Person', entityId: person.id, after: { changed }, ipHash: meta.ipHash }, tx);
  });
  revalidatePath('/cliente', 'layout');
  return ok('Guardamos tu información. Con esto ajustamos tus recomendaciones.');
});
