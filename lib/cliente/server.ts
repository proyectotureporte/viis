import type { z } from 'zod';
import type { Loan, Prisma } from '@/app/generated/prisma/client';
import type { ActionState } from '@/components/ov/forms';
import { fail, nextCode, UserError } from '@/lib/actions';
import type { LoanState } from '@/lib/finance/types';
import { notify } from '@/lib/jobs';
import { REQUEST_KINDS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { requestMeta, type RequestMeta } from '@/lib/security/request';
import { getSession, type CurrentSession } from '@/lib/security/session';
import { dueOnOrAfter, isoDay, previousDue } from './format';

type Tx = Prisma.TransactionClient;

export interface OwnPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** Expediente del usuario en sesión. Toda acción del cliente parte de aquí: garantiza propiedad. */
export async function ownPerson(session: CurrentSession, tx?: Tx): Promise<OwnPerson> {
  const person = await (tx ?? getPrisma()).person.findUnique({
    where: { userId: session.user.id },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!person) throw new UserError('Tu cuenta aún no tiene expediente. Escríbenos a contacto@viis.app para activarlo.');
  return person;
}

/**
 * Acción del cliente sobre SU expediente que no tiene un permiso específico
 * en la matriz (crédito, inmueble, hogar, escenarios, ofertas). Verifica
 * sesión + MFA + rol CLIENT, valida con zod, entrega el expediente propio y
 * convierte errores en mensajes seguros, igual que `secureAction`.
 */
export function clientAction<S extends z.ZodType>(
  schema: S,
  handler: (input: z.infer<S>, ctx: { session: CurrentSession; meta: RequestMeta; person: OwnPerson }) => Promise<ActionState>,
) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const session = await getSession();
    if (!session || !session.mfaPassed || !session.user.totpEnabled) return fail('Sesión no válida.');
    if (session.user.role !== 'CLIENT') return fail('No tienes permiso para esta acción.');
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
      const person = await ownPerson(session);
      return await handler(parsed.data, { session, meta: await requestMeta(), person });
    } catch (error) {
      if (error instanceof UserError) return fail(error.message);
      console.error('Acción de cliente fallida', { error: error instanceof Error ? error.message : 'desconocido' });
      return fail('No pudimos completar la acción. Inténtalo de nuevo.');
    }
  };
}

// ── Parámetros financieros ─────────────────────────────────────────────

export interface ParamValue {
  value: number;
  source: string;
  asOf: string;
}

export interface UvrParams {
  uvr: ParamValue | null;
  inflation: ParamValue | null;
}

/**
 * UVR vigente e inflación proyectada cargadas por Administración.
 * INFLACION_PROYECTADA se interpreta como fracción si es ≤ 1 (0,052 = 5,2 %)
 * y como porcentaje si es > 1 (5,2 = 5,2 %).
 */
export async function getUvrParams(): Promise<UvrParams> {
  const prisma = getPrisma();
  const [uvr, inflation] = await Promise.all([
    prisma.financialParameter.findFirst({ where: { key: 'UVR' }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }] }),
    prisma.financialParameter.findFirst({ where: { key: 'INFLACION_PROYECTADA' }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }] }),
  ]);
  const inflationValue = inflation ? Number(inflation.value) : null;
  return {
    uvr: uvr ? { value: Number(uvr.value), source: uvr.source, asOf: isoDay(uvr.asOf) } : null,
    inflation:
      inflation && inflationValue !== null
        ? { value: inflationValue > 1 ? inflationValue / 100 : inflationValue, source: inflation.source, asOf: isoDay(inflation.asOf) }
        : null,
  };
}

export interface RefRate {
  rateEa: number;
  source: string;
  asOf: string;
  product: string;
  entityName: string | null;
}

/** Tasa de referencia vigente más reciente del mismo sistema de amortización. */
export async function latestReferenceRate(system: string, today: string): Promise<RefRate | null> {
  const rate = await getPrisma().referenceRate.findFirst({
    where: { system, OR: [{ validUntil: null }, { validUntil: { gte: new Date(`${today}T00:00:00Z`) } }] },
    orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }],
    include: { entity: { select: { name: true } } },
  });
  if (!rate) return null;
  return { rateEa: Number(rate.rateEa), source: rate.source, asOf: isoDay(rate.asOf), product: rate.product, entityName: rate.entity?.name ?? null };
}

// ── Gemelo: crédito de la BD → estado del motor ───────────────────────

export interface LoanStateResult {
  state: LoanState | null;
  /** Por qué no se pudo calcular o qué supuesto se aplicó. */
  notices: string[];
}

export function loanStateOf(loan: Loan, params: UvrParams): LoanStateResult {
  const notices: string[] = [];
  const remainingMonths = loan.termMonths - loan.paidInstallments;
  const balance = toNumber(loan.balance);
  if (remainingMonths < 1) {
    notices.push('Según los datos registrados ya no quedan cuotas por pagar. Si aún debes, actualiza las cuotas pagadas.');
    return { state: null, notices };
  }
  if (balance <= 0) {
    notices.push('Registra el saldo actual del crédito para calcular tu cronograma.');
    return { state: null, notices };
  }
  // El saldo del extracto corresponde al corte de la última cuota pagada: el motor
  // arranca en el último día de pago <= fecha del saldo (periodo completo de interés).
  const balanceDate = isoDay(loan.balanceAsOf);
  const startDate = isoDay(loan.disbursedAt);
  const onOrAfter = dueOnOrAfter(balanceDate, loan.paymentDay);
  let asOf = onOrAfter === balanceDate ? balanceDate : previousDue(onOrAfter, loan.paymentDay);
  if (asOf < startDate) asOf = startDate;
  const state: LoanState = {
    principal: toNumber(loan.originalAmount),
    rateEa: Number(loan.rateEa),
    termMonths: loan.termMonths,
    system: loan.system,
    monthlyInsurance: toNumber(loan.monthlyInsurance),
    startDate,
    balance,
    remainingMonths,
    asOf,
    nextPaymentDate: dueOnOrAfter(asOf, loan.paymentDay, true),
  };
  if (loan.system === 'UVR') {
    if (!params.uvr || !params.inflation) {
      notices.push(
        'Tu crédito está en UVR y aún no tenemos cargados el valor oficial de la UVR y la inflación proyectada con su fuente. Por eso no proyectamos cuotas ni saldos en pesos futuros: sería una falsa certeza.',
      );
      return { state: null, notices };
    }
    state.uvr = { initialValue: params.uvr.value, annualInflation: params.inflation.value };
    state.uvrAtAsOf = params.uvr.value;
    notices.push(
      `Proyección UVR con UVR de ${params.uvr.value.toLocaleString('es-CO', { maximumFractionDigits: 4 })} (${params.uvr.source}, ${params.uvr.asOf}) e inflación supuesta de ${(params.inflation.value * 100).toFixed(2).replace('.', ',')} % anual (${params.inflation.source}, ${params.inflation.asOf}). Se toma la UVR vigente como la de la fecha de corte del saldo.`,
    );
  }
  return { state, notices };
}

// ── Solicitudes ────────────────────────────────────────────────────────

/** Notifica a coordinación y posventa activas (bandeja y correo por la cola). */
export async function notifyStaff(tx: Tx, input: { title: string; body: string; href: string }): Promise<void> {
  const staff = await tx.user.findMany({ where: { role: { in: ['COORDINATOR', 'POSTSALE'] }, active: true }, select: { id: true } });
  for (const user of staff) await notify({ userId: user.id, ...input }, tx);
}

export async function createServiceRequest(
  tx: Tx,
  input: { personId: string; kind: string; subject: string; detail: string; scenarioId?: string | null },
  ctx: { session: CurrentSession; meta: RequestMeta },
): Promise<{ id: string; code: string }> {
  const kind = REQUEST_KINDS[input.kind];
  if (!kind) throw new UserError('Tipo de solicitud inválido.');
  const code = await nextCode('SOL', tx);
  const request = await tx.serviceRequest.create({
    data: {
      code,
      personId: input.personId,
      kind: input.kind,
      subject: input.subject,
      detail: input.detail,
      slaDueAt: new Date(Date.now() + kind.slaHours * 3_600_000),
      scenarioId: input.scenarioId ?? null,
      createdById: ctx.session.user.id,
    },
  });
  await audit(
    {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: 'request.created',
      entity: 'ServiceRequest',
      entityId: request.id,
      after: { code, kind: input.kind, subject: input.subject, scenarioId: input.scenarioId ?? null },
      ipHash: ctx.meta.ipHash,
    },
    tx,
  );
  await notifyStaff(tx, {
    title: `Nueva solicitud ${code}: ${kind.label}`,
    body: input.subject,
    href: `/empresa/solicitudes/${request.id}`,
  });
  return { id: request.id, code };
}
