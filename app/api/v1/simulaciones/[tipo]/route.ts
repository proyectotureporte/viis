import { z } from 'zod';
import { canonicalInputsHash } from '@/lib/finance/hash';
import { simulateFixedVsUvr, simulateRentVsBuy, simulateSale, simulateStress, simulateTargetPayment } from '@/lib/finance/simulators';
import { recordAttempt, tooManyAttempts } from '@/lib/security/ratelimit';
import { requestMetaFrom } from '@/lib/security/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const money = z.number().finite().nonnegative().max(1e12);
const fraction = z.number().finite().min(0).max(1);
const term = z.number().int().min(1).max(420);

const SCHEMAS = {
  cuota: z.object({ principal: money.min(1), rateEa: fraction, termMonths: term, monthlyInsurance: money.optional(), system: z.literal('FIXED_PESOS').default('FIXED_PESOS'), incomeRatioLimit: fraction.optional() }),
  estres: z.object({ monthlyIncome: money, monthlyExpenses: money, payment: money, savings: money, incomeDropPct: fraction, newExpense: money }),
  'arriendo-vs-compra': z.object({ rent: money, rentIncreasePct: fraction, price: money.min(1), downPayment: money, rateEa: fraction, termMonths: term, appreciationPct: fraction, maintenancePct: fraction, horizonYears: z.number().int().min(1).max(35), opportunityRatePct: fraction }),
  venta: z.object({ price: money.min(1), loanBalance: money, saleCostsPct: fraction, taxesEstimate: money }),
  'fija-vs-uvr': z.object({ principal: money.min(1), termMonths: term, rateFixedEa: fraction, rateUvrEa: fraction, inflationScenarios: z.array(z.number().min(-0.05).max(0.5)).min(1).max(6) }),
} as const;

type Tipo = keyof typeof SCHEMAS;

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: { params: Promise<{ tipo: string }> }): Promise<Response> {
  const { tipo } = await params;
  if (!(tipo in SCHEMAS)) return reply({ error: 'Simulación desconocida.' }, 404);
  const { ipHash } = requestMetaFrom(request);
  const key = `api:sim:${ipHash ?? 'none'}`;
  if (await tooManyAttempts([key], 120, 60 * 60 * 1_000)) return reply({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  await recordAttempt([key], false);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: 'JSON inválido.' }, 400);
  }
  const parsed = SCHEMAS[tipo as Tipo].safeParse(body);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.', path: parsed.error.issues[0]?.path }, 422);

  try {
    const input = parsed.data as never;
    const result =
      tipo === 'cuota' ? simulateTargetPayment(input)
      : tipo === 'estres' ? simulateStress(input)
      : tipo === 'arriendo-vs-compra' ? simulateRentVsBuy(input)
      : tipo === 'venta' ? simulateSale(input)
      : (() => {
          const d = parsed.data as z.infer<(typeof SCHEMAS)['fija-vs-uvr']>;
          return simulateFixedVsUvr(d.principal, d.termMonths, d.rateFixedEa, d.rateUvrEa, d.inflationScenarios);
        })();
    return reply({ ...result, inputsHash: canonicalInputsHash(parsed.data), binding: false });
  } catch (error) {
    return reply({ error: error instanceof RangeError ? error.message : 'No se pudo calcular.' }, 422);
  }
}
