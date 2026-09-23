'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import { ok, secureAction, UserError, zId, zText } from '@/lib/actions';
import { zMaybeText, zOptId } from '@/lib/cliente/zod';
import { canonicalInputsHash, type LoanState } from '@/lib/finance';
import { SIM_SCHEMAS } from '@/lib/cliente/schemas';
import { NOT_BINDING, runSimulation, SIM_KINDS, SIM_META } from '@/lib/cliente/simulate';
import { clientAction, createServiceRequest, getUvrParams, loanStateOf, ownPerson } from '@/lib/cliente/server';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

const saveSchema = z.object({
  kind: z.enum(SIM_KINDS, { error: 'Tipo de simulación inválido.' }),
  name: zText(120, 1, 'Ponle un nombre al escenario.'),
  loanId: zOptId,
  params: z.string().min(2, 'Completa la simulación antes de guardarla.').max(5000),
});

/**
 * Guarda un escenario. NUNCA confía en los resultados del navegador: toma
 * solo los parámetros, lee el crédito de la base de datos y recalcula con el
 * motor. Guarda entradas, resultados, supuestos, versión y huella.
 */
export const saveScenarioAction = clientAction(saveSchema, async (input, { session, meta, person }) => {
  let rawParams: unknown;
  try {
    rawParams = JSON.parse(input.params);
  } catch {
    throw new UserError('Parámetros inválidos.');
  }
  const parsed = SIM_SCHEMAS[input.kind].safeParse(rawParams);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? 'Revisa los datos de la simulación.');
  const prisma = getPrisma();

  let loanState: LoanState | null = null;
  let loanId: string | null = null;
  if (SIM_META[input.kind].needsLoan) {
    if (!input.loanId) throw new UserError('Elige el crédito.');
    const loan = await prisma.loan.findFirst({ where: { id: input.loanId, personId: person.id, active: true } });
    if (!loan) throw new UserError('Crédito no encontrado.');
    const result = loanStateOf(loan, await getUvrParams());
    if (!result.state) throw new UserError(result.notices[0] ?? 'Completa los datos del crédito.');
    loanState = result.state;
    loanId = loan.id;
  }

  let sim;
  try {
    sim = runSimulation(input.kind, parsed.data, loanState);
  } catch (error) {
    throw new UserError(error instanceof Error ? `No se pudo simular: ${error.message}` : 'No se pudo simular con esos datos.');
  }
  const inputs = { kind: input.kind, params: parsed.data, loan: loanState };
  const inputsHash = canonicalInputsHash(inputs);
  const scenario = await prisma.$transaction(async (tx) => {
    const created = await tx.scenario.create({
      data: {
        userId: session.user.id,
        loanId,
        kind: input.kind,
        name: input.name,
        inputs: json(inputs),
        results: json(sim.results),
        assumptions: json({ assumptions: sim.assumptions, warnings: sim.warnings, notice: NOT_BINDING }),
        engineVersion: sim.engineVersion,
        inputsHash,
      },
    });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'scenario.saved', entity: 'Scenario', entityId: created.id, after: { kind: input.kind, name: input.name, inputsHash, engineVersion: sim.engineVersion }, ipHash: meta.ipHash }, tx);
    return created;
  });
  revalidatePath('/cliente/decidir');
  return ok(`Escenario "${scenario.name}" guardado. Lo encuentras abajo para comparar, compartir o descargar.`);
});

async function ownScenario(id: string, userId: string) {
  const scenario = await getPrisma().scenario.findFirst({ where: { id, userId } });
  if (!scenario) throw new UserError('Escenario no encontrado.');
  return scenario;
}

export const renameScenarioAction = clientAction(z.object({ id: zId, name: zText(120, 1, 'Escribe un nombre.') }), async (input, { session, meta }) => {
  const scenario = await ownScenario(input.id, session.user.id);
  await getPrisma().$transaction(async (tx) => {
    await tx.scenario.update({ where: { id: scenario.id }, data: { name: input.name } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'scenario.renamed', entity: 'Scenario', entityId: scenario.id, before: { name: scenario.name }, after: { name: input.name }, ipHash: meta.ipHash }, tx);
  });
  revalidatePath('/cliente/decidir');
  return ok('Nombre actualizado.');
});

export const duplicateScenarioAction = clientAction(z.object({ id: zId }), async (input, { session, meta }) => {
  const s = await ownScenario(input.id, session.user.id);
  await getPrisma().$transaction(async (tx) => {
    const copy = await tx.scenario.create({
      data: {
        userId: s.userId,
        loanId: s.loanId,
        kind: s.kind,
        name: `Copia de ${s.name}`.slice(0, 120),
        inputs: json(s.inputs),
        results: json(s.results),
        assumptions: json(s.assumptions),
        engineVersion: s.engineVersion,
        inputsHash: s.inputsHash,
      },
    });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'scenario.duplicated', entity: 'Scenario', entityId: copy.id, after: { from: s.id, inputsHash: s.inputsHash }, ipHash: meta.ipHash }, tx);
  });
  revalidatePath('/cliente/decidir');
  return ok('Escenario duplicado.');
});

export const shareScenarioAction = secureAction(
  'request.create',
  z.object({ id: zId, note: zMaybeText(1000) }),
  async (input, { session, meta }) => {
    const code = await getPrisma().$transaction(async (tx) => {
      const person = await ownPerson(session, tx);
      const s = await tx.scenario.findFirst({ where: { id: input.id, userId: session.user.id } });
      if (!s) throw new UserError('Escenario no encontrado.');
      const open = await tx.serviceRequest.findFirst({ where: { scenarioId: s.id, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] } }, select: { code: true } });
      if (open) throw new UserError(`Ya compartiste este escenario; la solicitud ${open.code} está en curso.`);
      await tx.scenario.update({ where: { id: s.id }, data: { sharedWithAdvisor: true } });
      const request = await createServiceRequest(
        tx,
        {
          personId: person.id,
          kind: 'ADVISOR',
          subject: `Revisión de escenario: ${s.name}`.slice(0, 200),
          detail: [
            `El cliente compartió el escenario "${s.name}" (${SIM_META[s.kind as keyof typeof SIM_META]?.label ?? s.kind}) para revisarlo con un asesor.`,
            `Motor ${s.engineVersion} · huella de entradas ${s.inputsHash}.`,
            input.note ? `Comentario del cliente: ${input.note}` : '',
          ].filter(Boolean).join('\n'),
          scenarioId: s.id,
        },
        { session, meta },
      );
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'scenario.shared', entity: 'Scenario', entityId: s.id, after: { requestCode: request.code }, ipHash: meta.ipHash }, tx);
      return request.code;
    });
    revalidatePath('/cliente', 'layout');
    return ok(`Compartido con un asesor (solicitud ${code}). Te contactaremos para revisarlo contigo.`);
  },
);
