/**
 * Siguiente mejor acción para un hogar con crédito hipotecario.
 *
 * Reglas duras (especificación del cliente):
 *  - Si faltan datos críticos (ingresos o saldo) NO se recomiendan abonos:
 *    primero se pide el dato.
 *  - Nunca solo "pague más": se evalúan liquidez, seguros, compra de cartera,
 *    documentos, ruta preventiva y fecha de pago.
 *
 * Priorización: puntaje = 0,40·urgencia + 0,35·beneficio + 0,25·factibilidad
 * (cada factor entre 0 y 1). Mayor puntaje primero.
 */

import { pesos, porcentaje } from '../formato';
import { remainingSchedule } from './amortization';
import { addMonths } from './dates';
import { simulatePortfolioPurchase, simulatePrepayment, simulateStress } from './simulators';
import type { AlertLevel } from './simulators';
import type { LoanState, Schedule } from './types';

export type ActionCode =
  | 'PONERSE_AL_DIA'
  | 'COMPLETAR_DATO_INGRESOS'
  | 'COMPLETAR_DATO_SALDO'
  | 'COMPLETAR_DOCUMENTO'
  | 'RUTA_PREVENTIVA'
  | 'CONSERVAR_LIQUIDEZ'
  | 'COMPARAR_COMPRA_CARTERA'
  | 'REVISAR_SEGURO'
  | 'CAMBIAR_FECHA_PAGO'
  | 'ABONO_CAPITAL';

export interface ReferenceRate {
  rateEa: number;
  source: string;
  asOf: string;
}

export interface NextBestActionContext {
  loanState?: LoanState | null;
  referenceRate?: ReferenceRate;
  household: { income?: number; expenses?: number; savings?: number };
  /** Documentos o datos faltantes (texto libre: 'ingresos', 'saldo', 'certificado laboral'...). */
  missing: string[];
  paymentsOverdue: boolean;
}

export interface NextBestAction {
  code: ActionCode;
  title: string;
  reason: string;
  /** Impacto estimado en pesos o meses, en lenguaje humano. */
  impact: string;
  cta: string;
  /** Datos o documentos necesarios para ejecutar la acción. */
  requires: string[];
  urgency: number;
  benefit: number;
  feasibility: number;
  score: number;
}

/** Diferencia mínima de tasa para sugerir comparar compra de cartera: 1 punto EA. */
export const PORTFOLIO_RATE_GAP = 0.01;
/** Reserva mínima de liquidez, en cuotas. */
export const MIN_RESERVE_PAYMENTS = 3;

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const isIncomeItem = (s: string) => /ingreso/.test(normalize(s));
const isBalanceItem = (s: string) => /saldo/.test(normalize(s));

function action(
  a: Omit<NextBestAction, 'score'>,
): NextBestAction {
  const score = Math.round((0.4 * a.urgency + 0.35 * a.benefit + 0.25 * a.feasibility) * 1000) / 1000;
  return { ...a, score };
}

const pct = (x: number) => `${porcentaje(x * 100, 2)} %`;

export function nextBestActions(ctx: NextBestActionContext): NextBestAction[] {
  const { household, loanState, referenceRate } = ctx;
  const out: NextBestAction[] = [];

  const incomeMissing = !(household.income && household.income > 0) || ctx.missing.some(isIncomeItem);
  const balanceMissing = !(loanState && loanState.balance > 0) || ctx.missing.some(isBalanceItem);
  const criticalMissing = incomeMissing || balanceMissing;

  // Cronograma restante (si el saldo es válido).
  let schedule: Schedule | null = null;
  if (loanState && !balanceMissing) {
    try {
      schedule = remainingSchedule(loanState);
    } catch {
      schedule = null;
    }
  }
  const payment = schedule?.basePayment;

  // Estrés con la situación actual (sin caídas hipotéticas).
  let alert: AlertLevel | null = null;
  if (!incomeMissing && household.expenses !== undefined && payment !== undefined) {
    alert = simulateStress({
      monthlyIncome: household.income ?? 0,
      monthlyExpenses: household.expenses,
      payment,
      savings: household.savings ?? 0,
      incomeDropPct: 0,
      newExpense: 0,
    }).results.alert;
  }

  // 1. Atrasos: lo primero es normalizar la relación con el banco.
  if (ctx.paymentsOverdue) {
    out.push(
      action({
        code: 'PONERSE_AL_DIA',
        title: 'Ponerse al día con las cuotas atrasadas',
        reason: 'Hay pagos vencidos: generan intereses de mora y pueden afectar su historial crediticio.',
        impact: payment !== undefined ? `Cada cuota vencida es de aproximadamente ${pesos(payment)} más intereses de mora.` : 'Evita intereses de mora y reportes negativos.',
        cta: 'Hablar con el banco sobre un acuerdo de pago',
        requires: ['extracto del crédito'],
        urgency: 1,
        benefit: 0.9,
        feasibility: 0.6,
      }),
    );
  }

  // 2. Datos críticos faltantes: se piden antes de recomendar abonos.
  if (incomeMissing) {
    out.push(
      action({
        code: 'COMPLETAR_DATO_INGRESOS',
        title: 'Registrar los ingresos del hogar',
        reason: 'Sin ingresos no es posible saber si un abono o un cambio de cuota es prudente.',
        impact: 'Permite calcular su margen mensual y recomendaciones con cifras reales.',
        cta: 'Completar ingresos',
        requires: ['ingresos mensuales'],
        urgency: 0.8,
        benefit: 0.7,
        feasibility: 0.95,
      }),
    );
  }
  if (balanceMissing) {
    out.push(
      action({
        code: 'COMPLETAR_DATO_SALDO',
        title: 'Registrar el saldo actual del crédito',
        reason: 'Sin el saldo no se puede calcular el cronograma restante ni el efecto de un abono.',
        impact: 'Permite estimar intereses restantes, fecha de terminación y ahorros posibles.',
        cta: 'Cargar extracto o saldo',
        requires: ['saldo del crédito', 'cuotas restantes'],
        urgency: 0.8,
        benefit: 0.7,
        feasibility: 0.9,
      }),
    );
  }
  for (const item of ctx.missing) {
    if (isIncomeItem(item) || isBalanceItem(item)) continue;
    out.push(
      action({
        code: 'COMPLETAR_DOCUMENTO',
        title: `Completar: ${item}`,
        reason: 'Falta este documento o dato para avanzar en el proceso.',
        impact: 'Evita demoras en la revisión de su caso.',
        cta: 'Subir documento',
        requires: [item],
        urgency: 0.6,
        benefit: 0.5,
        feasibility: 0.9,
      }),
    );
  }

  // 3. Ruta preventiva ante estrés o atraso.
  if (ctx.paymentsOverdue || alert === 'RIESGO' || alert === 'VIGILAR') {
    const riesgo = ctx.paymentsOverdue || alert === 'RIESGO';
    out.push(
      action({
        code: 'RUTA_PREVENTIVA',
        title: 'Activar la ruta preventiva',
        reason: riesgo
          ? 'Su presupuesto muestra señales de riesgo para cubrir la cuota.'
          : 'Su margen mensual es estrecho; conviene anticiparse.',
        impact: 'Revisar alternativas (periodo de gracia, ampliación de plazo, ajuste de gastos) antes de que haya atrasos o que estos crezcan.',
        cta: 'Revisar plan preventivo',
        requires: ['ingresos mensuales', 'gastos mensuales'],
        urgency: riesgo ? 0.95 : 0.7,
        benefit: 0.8,
        feasibility: 0.8,
      }),
    );
  }

  // 4. Liquidez: con menos de 3 cuotas ahorradas, primero el colchón.
  const savings = household.savings;
  const lowLiquidity = payment !== undefined && savings !== undefined && savings < MIN_RESERVE_PAYMENTS * payment;
  if (lowLiquidity && payment !== undefined && savings !== undefined) {
    const target = MIN_RESERVE_PAYMENTS * payment;
    out.push(
      action({
        code: 'CONSERVAR_LIQUIDEZ',
        title: 'Conservar liquidez antes de abonar',
        reason: `Su ahorro cubre menos de ${MIN_RESERVE_PAYMENTS} cuotas; un imprevisto podría llevarlo a atrasarse.`,
        impact: `Meta de reserva: ${pesos(target)} (${MIN_RESERVE_PAYMENTS} cuotas). Le faltan ${pesos(target - savings)}.`,
        cta: 'Definir meta de ahorro',
        requires: ['ahorros disponibles'],
        urgency: 0.75,
        benefit: 0.7,
        feasibility: 0.7,
      }),
    );
  }

  // 5. Compra de cartera si la tasa de referencia es al menos 1 punto EA menor.
  if (schedule && loanState && referenceRate && referenceRate.rateEa <= loanState.rateEa - PORTFOLIO_RATE_GAP) {
    const sim = simulatePortfolioPurchase(loanState, { newRateEa: referenceRate.rateEa });
    const r = sim.results;
    out.push(
      action({
        code: 'COMPARAR_COMPRA_CARTERA',
        title: 'Comparar una compra de cartera',
        reason: `Su tasa (${pct(loanState.rateEa)} EA) supera en ${porcentaje((loanState.rateEa - referenceRate.rateEa) * 100, 2)} puntos la referencia de ${pct(referenceRate.rateEa)} EA (${referenceRate.source}, ${referenceRate.asOf}).`,
        impact: `Con esa tasa la cuota podría bajar cerca de ${pesos(r.monthlySavings)} al mes y el ahorro total estimado sería de ${pesos(r.grossSavings)} antes de costos del traslado.`,
        cta: 'Simular compra de cartera',
        requires: ['saldo del crédito', 'certificado de deuda', 'costos del traslado'],
        urgency: 0.5,
        benefit: Math.min(1, 0.5 + r.grossSavings / Math.max(loanState.balance, 1)),
        feasibility: criticalMissing ? 0.4 : 0.6,
      }),
    );
  }

  // 6. Seguros: se pueden revisar y, si la entidad lo acepta, reemplazar por una póliza equivalente.
  if (schedule && loanState && ((loanState.monthlyInsurance ?? 0) > 0 || (loanState.insuranceRateMonthly ?? 0) > 0)) {
    out.push(
      action({
        code: 'REVISAR_SEGURO',
        title: 'Revisar los seguros del crédito',
        reason: 'Los seguros de vida e incendio pesan en la cuota; en Colombia el deudor puede presentar una póliza propia con coberturas equivalentes.',
        impact: `Hoy paga cerca de ${pesos(schedule.rows[0].insurance)} al mes en seguros; ${pesos(schedule.totals.insurance)} en lo que resta del crédito.`,
        cta: 'Cotizar seguros',
        requires: ['póliza actual', 'certificado de seguros del banco'],
        urgency: 0.35,
        benefit: 0.45,
        feasibility: 0.75,
      }),
    );
  }

  // 7. Fecha de pago alineada con el ingreso.
  if (ctx.paymentsOverdue || alert === 'VIGILAR' || alert === 'RIESGO') {
    out.push(
      action({
        code: 'CAMBIAR_FECHA_PAGO',
        title: 'Alinear la fecha de pago con el día de ingreso',
        reason: 'Pagar justo después de recibir el ingreso reduce el riesgo de atraso.',
        impact: 'Menos riesgo de mora sin cambiar el valor de la cuota.',
        cta: 'Solicitar cambio de fecha al banco',
        requires: ['fecha de ingreso'],
        urgency: 0.4,
        benefit: 0.35,
        feasibility: 0.85,
      }),
    );
  }

  // 8. Abono a capital: solo con datos completos, sin atrasos, sin estrés y con reserva cubierta.
  const canPrepay =
    !criticalMissing && !ctx.paymentsOverdue && !lowLiquidity && alert !== 'RIESGO' && alert !== 'VIGILAR';
  if (canPrepay && schedule && loanState && payment !== undefined && savings !== undefined) {
    const reserve = Math.max(
      MIN_RESERVE_PAYMENTS * payment,
      household.expenses !== undefined ? MIN_RESERVE_PAYMENTS * (household.expenses + payment) : 0,
    );
    const available = Math.floor(savings - reserve);
    if (available > 0) {
      const amount = Math.min(available, loanState.balance);
      const date = loanState.nextPaymentDate ?? addMonths(loanState.asOf, 1);
      const sim = simulatePrepayment(loanState, { amount, date, mode: 'TERM' }).results;
      out.push(
        action({
          code: 'ABONO_CAPITAL',
          title: 'Evaluar un abono a capital',
          reason: `Tiene ahorro por encima de su reserva de emergencia (${pesos(reserve)}).`,
          impact: `Abonar ${pesos(amount)} reduciendo plazo acortaría el crédito ~${sim.monthsReduced} meses y ahorraría ~${pesos(sim.interestSaved)} en intereses.`,
          cta: 'Simular abono',
          requires: ['ahorros disponibles', 'saldo del crédito'],
          urgency: 0.3,
          benefit: Math.min(1, 0.4 + sim.interestSaved / Math.max(loanState.balance, 1)),
          feasibility: 0.7,
        }),
      );
    }
  }

  return out.sort((a, b) => b.score - a.score);
}
