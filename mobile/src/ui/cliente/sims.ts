/**
 * Formularios de los simuladores: MISMOS campos, valores por defecto y
 * conversión a parámetros que el simulador web (app/(plataforma)/cliente/decidir/Simulador.tsx),
 * para que la app calcule idéntico con `@/lib/cliente/simulate`.
 */
import { parsePercentInput, percentInputText } from '@/lib/cliente/format';
import type { SimKind, SimParams } from '@/lib/cliente/simulate';
import type { SimContextView } from '@/lib/movil/contract';
import { milesInput, soloDigitos } from '@/services/format';

export type FieldType = 'money' | 'pct' | 'int' | 'date' | 'select';
export interface SimField {
  name: string;
  label: string;
  type: FieldType;
  help?: string;
  /** 'zero': vacío = 0 · 'omit': vacío = no se envía · undefined: obligatorio. */
  optional?: 'zero' | 'omit';
  options?: [string, string][];
  showIf?: (values: Record<string, string>) => boolean;
}

export type SimLoan = SimContextView['loans'][number];

const MODE: [string, string][] = [['TERM', 'Reducir el plazo (misma cuota)'], ['PAYMENT', 'Reducir la cuota (mismo plazo)']];

export const FIELDS: Record<SimKind, SimField[]> = {
  PREPAYMENT: [
    { name: 'amount', label: 'Valor del abono ($)', type: 'money' },
    { name: 'date', label: 'Fecha del abono', type: 'date' },
    { name: 'mode', label: 'Quiero', type: 'select', options: MODE },
  ],
  TERM_CHANGE: [
    { name: 'newTermMonths', label: 'Cuotas restantes que quieres', type: 'int' },
    { name: 'costs', label: 'Costos del trámite ($)', type: 'money', optional: 'zero', help: 'Si tu entidad cobra estudio, avalúo o gastos notariales.' },
  ],
  PORTFOLIO: [
    { name: 'newRateEa', label: 'Tasa nueva EA (%)', type: 'pct' },
    { name: 'costs', label: 'Costos del traslado ($)', type: 'money', optional: 'zero', help: 'Estudio de crédito, avalúo, notaría, registro, beneficencia.' },
    { name: 'newTermMonths', label: 'Plazo nuevo en meses (opcional)', type: 'int', optional: 'omit', help: 'Vacío = las mismas cuotas que te faltan.' },
    { name: 'newMonthlyInsurance', label: 'Seguros mensuales nuevos ($, opcional)', type: 'money', optional: 'omit' },
  ],
  FREE_EARLY: [{ name: 'targetDate', label: '¿Cuándo quieres terminar de pagar?', type: 'date' }],
  EXTRAORDINARY: [
    { name: 'amount', label: 'Valor de cada abono ($)', type: 'money' },
    { name: 'everyMonths', label: 'Cada cuánto', type: 'select', options: [['1', 'Cada mes'], ['3', 'Cada 3 meses'], ['6', 'Cada 6 meses (primas)'], ['12', 'Una vez al año']] },
    { name: 'mode', label: 'Quiero', type: 'select', options: MODE },
  ],
  TARGET_PAYMENT: [
    { name: 'principal', label: 'Monto del crédito ($)', type: 'money' },
    { name: 'rateEa', label: 'Tasa EA (%)', type: 'pct' },
    { name: 'termMonths', label: 'Plazo (meses)', type: 'int' },
    { name: 'system', label: 'Sistema', type: 'select', options: [['FIXED_PESOS', 'Tasa fija en pesos'], ['UVR', 'UVR']] },
    { name: 'inflation', label: 'Inflación anual supuesta (%)', type: 'pct', showIf: (v) => v.system === 'UVR' },
    { name: 'monthlyInsurance', label: 'Seguros mensuales ($)', type: 'money', optional: 'zero' },
    { name: 'incomeRatioLimit', label: 'Máximo de tu ingreso para la cuota (%)', type: 'pct', help: '30 % es la referencia para vivienda en Colombia.' },
    { name: 'monthlyIncome', label: 'Tu ingreso mensual ($, opcional)', type: 'money', optional: 'omit' },
  ],
  FIXED_VS_UVR: [
    { name: 'principal', label: 'Monto ($)', type: 'money' },
    { name: 'termMonths', label: 'Plazo (meses)', type: 'int' },
    { name: 'rateFixedEa', label: 'Tasa fija en pesos EA (%)', type: 'pct' },
    { name: 'rateUvrEa', label: 'Tasa UVR (adicional a la UVR) EA (%)', type: 'pct' },
    { name: 'infl1', label: 'Inflación escenario 1 (%)', type: 'pct' },
    { name: 'infl2', label: 'Inflación escenario 2 (%)', type: 'pct', optional: 'omit' },
    { name: 'infl3', label: 'Inflación escenario 3 (%)', type: 'pct', optional: 'omit' },
  ],
  STRESS: [
    { name: 'monthlyIncome', label: 'Ingreso mensual del hogar ($)', type: 'money' },
    { name: 'monthlyExpenses', label: 'Gastos sin la cuota ($)', type: 'money' },
    { name: 'payment', label: 'Cuota del crédito ($)', type: 'money' },
    { name: 'savings', label: 'Ahorros disponibles ($)', type: 'money', optional: 'zero' },
    { name: 'incomeDropPct', label: 'Caída del ingreso (%)', type: 'pct', optional: 'zero', help: 'Desempleo total = 100 %.' },
    { name: 'newExpense', label: 'Gasto nuevo mensual ($)', type: 'money', optional: 'zero' },
  ],
  RENT_VS_BUY: [
    { name: 'rent', label: 'Arriendo mensual ($)', type: 'money' },
    { name: 'rentIncreasePct', label: 'Incremento anual del arriendo (%)', type: 'pct' },
    { name: 'price', label: 'Precio del inmueble ($)', type: 'money' },
    { name: 'downPayment', label: 'Cuota inicial ($)', type: 'money' },
    { name: 'rateEa', label: 'Tasa del crédito EA (%)', type: 'pct' },
    { name: 'termMonths', label: 'Plazo (meses)', type: 'int' },
    { name: 'appreciationPct', label: 'Valorización anual (%)', type: 'pct' },
    { name: 'maintenancePct', label: 'Mantenimiento, predial y administración anual (% del valor)', type: 'pct' },
    { name: 'opportunityRatePct', label: 'Rentabilidad de tu ahorro EA (%)', type: 'pct' },
    { name: 'horizonYears', label: 'Horizonte (años)', type: 'int' },
  ],
  SALE: [
    { name: 'price', label: 'Precio de venta ($)', type: 'money' },
    { name: 'loanBalance', label: 'Saldo del crédito a pagar ($)', type: 'money', optional: 'zero' },
    { name: 'saleCostsPct', label: 'Comisión y gastos de venta (%)', type: 'pct', optional: 'zero' },
    { name: 'taxesEstimate', label: 'Impuestos estimados ($)', type: 'money', optional: 'zero', help: 'Ganancia ocasional, retención en la fuente: confírmalos con un contador.' },
  ],
};

const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : milesInput(String(Math.round(n))) || '0');

export function simDefaults(kind: SimKind, ctx: SimContextView, loan: SimLoan | null): Record<string, string> {
  const s = loan?.state;
  const h = ctx.household;
  switch (kind) {
    case 'PREPAYMENT':
      return { amount: '', date: s?.nextPaymentDate ?? ctx.today, mode: 'TERM' };
    case 'TERM_CHANGE':
      return { newTermMonths: '', costs: '' };
    case 'PORTFOLIO':
      return { newRateEa: ctx.refRate ? percentInputText(ctx.refRate.rateEa) : '', costs: '', newTermMonths: '', newMonthlyInsurance: '' };
    case 'FREE_EARLY':
      return { targetDate: '' };
    case 'EXTRAORDINARY':
      return { amount: '', everyMonths: '12', mode: 'TERM' };
    case 'TARGET_PAYMENT':
      return { principal: '', rateEa: '', termMonths: '', system: 'FIXED_PESOS', inflation: ctx.inflation ? percentInputText(ctx.inflation.value) : '', monthlyInsurance: '', incomeRatioLimit: '30', monthlyIncome: money(h.income) };
    case 'FIXED_VS_UVR':
      return {
        principal: s ? money(s.balance) : '',
        termMonths: s ? String(s.remainingMonths) : '',
        rateFixedEa: s && s.system === 'FIXED_PESOS' ? percentInputText(s.rateEa) : '',
        rateUvrEa: s && s.system === 'UVR' ? percentInputText(s.rateEa) : '',
        infl1: ctx.inflation ? percentInputText(ctx.inflation.value) : '',
        infl2: '',
        infl3: '',
      };
    case 'STRESS':
      return { monthlyIncome: money(h.income), monthlyExpenses: money(h.expenses), payment: loan?.payment ? money(Math.round(loan.payment)) : '', savings: money(h.savings), incomeDropPct: '', newExpense: '' };
    case 'RENT_VS_BUY':
      return { rent: '', rentIncreasePct: '', price: '', downPayment: '', rateEa: ctx.refRate ? percentInputText(ctx.refRate.rateEa) : '', termMonths: '', appreciationPct: '', maintenancePct: '', opportunityRatePct: '', horizonYears: '' };
    case 'SALE':
      return { price: ctx.home ? money(ctx.home.value) : '', loanBalance: s ? money(s.balance) : '', saleCostsPct: '', taxesEstimate: '' };
  }
}

export function toParams(kind: SimKind, values: Record<string, string>): { params?: SimParams; missing: string[] } {
  const out: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const f of FIELDS[kind]) {
    if (f.showIf && !f.showIf(values)) continue;
    const raw = (values[f.name] ?? '').trim();
    if (raw === '') {
      if (f.optional === 'zero') out[f.name] = f.type === 'select' || f.type === 'date' ? undefined : 0;
      else if (!f.optional) missing.push(f.label.replace(/\s*\(.*\)$/, ''));
      continue;
    }
    if (f.type === 'money') out[f.name] = soloDigitos(raw);
    else if (f.type === 'pct') {
      const v = parsePercentInput(raw);
      if (!Number.isFinite(v)) missing.push(f.label);
      else out[f.name] = v;
    } else if (f.type === 'int') {
      const v = Number(raw);
      if (!Number.isInteger(v)) missing.push(f.label);
      else out[f.name] = v;
    } else if (f.type === 'select' && f.name === 'everyMonths') out[f.name] = Number(raw);
    else out[f.name] = raw;
  }
  if (missing.length) return { missing };
  if (kind === 'FIXED_VS_UVR') {
    const inflations = [out.infl1, out.infl2, out.infl3].filter((x): x is number => typeof x === 'number');
    delete out.infl1;
    delete out.infl2;
    delete out.infl3;
    out.inflations = inflations;
  }
  return { params: out as unknown as SimParams, missing };
}
