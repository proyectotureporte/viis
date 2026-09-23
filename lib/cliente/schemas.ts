import { z } from 'zod';
import type { SimKind, SimParams } from './simulate';

/** Validación en servidor de los parámetros de cada simulación (nunca se confía en el navegador). */
const money = z.number().finite().nonnegative().max(1e13);
const positiveMoney = z.number().finite().positive('El valor debe ser mayor que cero.').max(1e13);
const fraction = z.number().finite().min(-0.5).max(1);
const posFraction = z.number().finite().min(0).max(1);
const rate = z.number().finite().min(0).max(1, 'Tasa fuera de rango.');
const months = z.number().int().min(1).max(480);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.');
const mode = z.enum(['TERM', 'PAYMENT']);

export const SIM_SCHEMAS: Record<SimKind, z.ZodType<SimParams>> = {
  PREPAYMENT: z.object({ amount: positiveMoney, date: isoDate, mode }).strict(),
  TERM_CHANGE: z.object({ newTermMonths: months, costs: money }).strict(),
  PORTFOLIO: z
    .object({ newRateEa: rate, newTermMonths: months.optional(), costs: money, newMonthlyInsurance: money.optional() })
    .strict(),
  FREE_EARLY: z.object({ targetDate: isoDate }).strict(),
  EXTRAORDINARY: z.object({ amount: positiveMoney, everyMonths: z.number().int().min(1).max(24), mode }).strict(),
  TARGET_PAYMENT: z
    .object({
      principal: positiveMoney,
      rateEa: rate,
      termMonths: months,
      monthlyInsurance: money,
      system: z.enum(['FIXED_PESOS', 'UVR']),
      inflation: fraction.optional(),
      incomeRatioLimit: z.number().min(0.01).max(1),
      monthlyIncome: money.optional(),
    })
    .strict(),
  FIXED_VS_UVR: z
    .object({
      principal: positiveMoney,
      termMonths: months,
      rateFixedEa: rate,
      rateUvrEa: rate,
      inflations: z.array(fraction).min(1).max(5),
    })
    .strict(),
  STRESS: z
    .object({
      monthlyIncome: money,
      monthlyExpenses: money,
      payment: money,
      savings: money,
      incomeDropPct: posFraction,
      newExpense: money,
    })
    .strict(),
  RENT_VS_BUY: z
    .object({
      rent: money,
      rentIncreasePct: fraction,
      price: positiveMoney,
      downPayment: money,
      rateEa: rate,
      termMonths: months,
      appreciationPct: fraction,
      maintenancePct: posFraction,
      horizonYears: z.number().int().min(1).max(40),
      opportunityRatePct: fraction,
    })
    .strict(),
  SALE: z.object({ price: positiveMoney, loanBalance: money, saleCostsPct: posFraction, taxesEstimate: money }).strict(),
};
