'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/ov/forms';
import { secureAction } from '@/lib/actions';
import { getPrisma } from '@/lib/prisma';
import { createCaseFromAdvisor } from './create';
import { personCaseSchema } from './schema';

type CreatedState = ActionState & { caseId?: string };

const createCase = secureAction('case.create', personCaseSchema, async (input, { session, meta }) => {
  const created = await getPrisma().$transaction((tx) => createCaseFromAdvisor(tx, input, { actor: session.user, meta }, 'DIRECTO'));
  revalidatePath('/empresa/bandeja');
  revalidatePath('/empresa');
  const state: CreatedState = { ok: true, message: `Caso ${created.code} creado${created.personCreated ? '' : ' para un cliente que ya existía en el expediente'}.`, at: Date.now(), caseId: created.id };
  return state;
});

/**
 * secureAction convierte cualquier excepción en mensaje, incluida la de
 * redirect(); por eso la redirección al expediente se hace aquí, fuera de él.
 */
export async function createCaseAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const state = (await createCase(prev, formData)) as CreatedState;
  if (state?.ok && state.caseId) redirect(`/empresa/casos/${state.caseId}`);
  return state;
}
