'use client';

import { useMemo, useState } from 'react';
import { KeepForm, Submit } from '@/components/cliente/Form';
import type { FormAction } from '@/components/ov/forms';
import type { LoanState } from '@/lib/finance/types';
import { isoText, parsePercentInput, percentInputText, rateText } from '@/lib/cliente/format';
import {
  describeLoan,
  NOT_BINDING,
  runSimulation,
  SIM_KINDS,
  SIM_META,
  summarizeResults,
  type SimKind,
  type SimOutput,
  type SimParams,
} from '@/lib/cliente/simulate';
import { milesTexto, pesos, soloDigitos } from '@/lib/formato';

export interface SimLoan {
  id: string;
  alias: string;
  state: LoanState | null;
  notices: string[];
  payment: number | null;
}

export interface SimContext {
  loans: SimLoan[];
  household: { income: number | null; expenses: number | null; savings: number | null };
  refRate: { rateEa: number; source: string; asOf: string } | null;
  inflation: { value: number; source: string; asOf: string } | null;
  home: { value: number; source: string; asOf: string; confidence: string } | null;
  today: string;
}

type FieldType = 'money' | 'pct' | 'int' | 'date' | 'select';
interface Field {
  name: string;
  label: string;
  type: FieldType;
  help?: string;
  /** 'zero': vacío = 0 · 'omit': vacío = no se envía · undefined: obligatorio. */
  optional?: 'zero' | 'omit';
  options?: Array<[string, string]>;
  showIf?: (values: Record<string, string>) => boolean;
}

const MODE: Array<[string, string]> = [['TERM', 'Reducir el plazo (misma cuota)'], ['PAYMENT', 'Reducir la cuota (mismo plazo)']];

const FIELDS: Record<SimKind, Field[]> = {
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

const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : milesTexto(n) || '0');

function defaults(kind: SimKind, ctx: SimContext, loan: SimLoan | null): Record<string, string> {
  const s = loan?.state;
  const { household: h } = ctx;
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

function toParams(kind: SimKind, values: Record<string, string>): { params?: SimParams; missing: string[] } {
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
    } else if (f.type === 'select' && (f.name === 'everyMonths')) out[f.name] = Number(raw);
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

function SimField({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const id = `sim-${field.name}`;
  const help = field.help ? `${id}-help` : undefined;
  return (
    <div className="ov-field">
      <label htmlFor={id} style={{ fontSize: 13.5, color: 'var(--ov-muted)', fontWeight: 600 }}>{field.label}</label>
      {field.type === 'select' ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={help}>
          {field.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : field.type === 'date' ? (
        <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={help} />
      ) : (
        <input
          id={id}
          inputMode={field.type === 'pct' ? 'decimal' : 'numeric'}
          value={value}
          onChange={(e) => onChange(field.type === 'money' ? milesTexto(soloDigitos(e.target.value)) : e.target.value)}
          aria-describedby={help}
          autoComplete="off"
        />
      )}
      {field.help && <small id={help}>{field.help}</small>}
    </div>
  );
}

export function Simulador({ ctx, initialKind, saveAction }: { ctx: SimContext; initialKind: SimKind; saveAction: FormAction }) {
  const [kind, setKind] = useState<SimKind>(initialKind);
  const firstUsable = ctx.loans.find((l) => l.state) ?? ctx.loans[0] ?? null;
  const [loanId, setLoanId] = useState<string | undefined>(firstUsable?.id);
  const loan = ctx.loans.find((l) => l.id === loanId) ?? null;
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const current = values[`${kind}:${loanId ?? ''}`] ?? defaults(kind, ctx, loan);
  const setValue = (name: string, v: string) => setValues((all) => ({ ...all, [`${kind}:${loanId ?? ''}`]: { ...current, [name]: v } }));
  const meta = SIM_META[kind];

  const computed = useMemo((): { output?: SimOutput; params?: SimParams; message?: string } => {
    if (meta.needsLoan && !loan?.state) return { message: loan ? loan.notices[0] ?? 'Completa los datos del crédito para simular.' : 'Registra tu crédito para usar esta simulación.' };
    const { params, missing } = toParams(kind, current);
    if (!params) return { message: `Completa: ${missing.join(', ')}.` };
    try {
      return { output: runSimulation(kind, params, meta.needsLoan ? loan!.state : null), params };
    } catch (error) {
      return { message: error instanceof Error ? error.message : 'Revisa los datos.' };
    }
  }, [kind, current, loan, meta.needsLoan]);

  const lines = computed.output ? summarizeResults(kind, computed.output.results) : [];
  const r = computed.output?.results;
  const extraWarnings: string[] = [];
  const { income, expenses } = ctx.household;
  if (r && kind === 'FREE_EARLY' && income !== null && expenses !== null && loan?.payment) {
    const margin = income - expenses - loan.payment;
    if (Number(r.monthlyExtra) > margin) extraWarnings.push(`El abono mensual necesario supera tu margen mensual declarado (${pesos(margin)}). Una fecha más lejana puede ser más realista.`);
  }
  if (r && kind === 'PREPAYMENT' && ctx.household.savings !== null && loan?.payment) {
    const amount = Number((computed.params as { amount?: number })?.amount ?? 0);
    if (ctx.household.savings - amount < 3 * loan.payment) extraWarnings.push(`Después de este abono tu ahorro declarado quedaría por debajo de 3 cuotas (${pesos(3 * loan.payment)}). Conserva un colchón antes de abonar.`);
  }

  const today = ctx.today;
  return (
    <article className="ov-card" aria-labelledby="sim-title">
      <h2 id="sim-title" className="cl-sr">Simulador</h2>
      <div className="cl-simtabs" role="tablist" aria-label="Tipo de simulación">
        {SIM_KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={k === kind} aria-controls="sim-panel" onClick={() => setKind(k)}>
            {SIM_META[k].label}
          </button>
        ))}
      </div>
      <div id="sim-panel" role="tabpanel" aria-label={meta.label}>
        <p className="cl-simq"><strong>{meta.question}</strong></p>
        {meta.needsLoan && ctx.loans.length > 1 && (
          <div className="ov-field" style={{ maxWidth: 360, marginBottom: 12 }}>
            <label htmlFor="sim-loan" style={{ fontSize: 13.5, color: 'var(--ov-muted)', fontWeight: 600 }}>Crédito</label>
            <select id="sim-loan" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
              {ctx.loans.map((l) => <option key={l.id} value={l.id}>{l.alias}</option>)}
            </select>
          </div>
        )}
        {meta.needsLoan && loan?.state && (
          <p className="ov-meta" style={{ marginTop: 0 }}>
            Con tu crédito: {describeLoan(loan.state).map((l) => `${l.label.toLowerCase()} ${l.value}`).join(' · ')}. <span className="ov-conf ov-conf--DECLARED">Declarado por ti</span>
          </p>
        )}
        {kind === 'PORTFOLIO' && ctx.refRate && (
          <p className="ov-meta">Tasa de referencia sugerida: {rateText(ctx.refRate.rateEa)} EA ({ctx.refRate.source}, {isoText(ctx.refRate.asOf)}). Puedes cambiarla por la de una oferta real.</p>
        )}
        {kind === 'SALE' && ctx.home && (
          <p className="ov-meta">Precio sugerido: tu último valor registrado ({ctx.home.source}, {isoText(ctx.home.asOf)}). No es un avalúo.</p>
        )}

        <div className="ov-form ov-form--3">
          {FIELDS[kind]
            .filter((f) => !f.showIf || f.showIf(current))
            .map((f) => (
              <SimField key={f.name} field={f} value={current[f.name] ?? ''} onChange={(v) => setValue(f.name, v)} />
            ))}
        </div>

        <div className="ov-sim-result" aria-live="polite">
          {computed.output ? (
            <>
              <div className="ov-sim-grid">
                {lines.map((l) => (
                  <div key={l.label}><small>{l.label}</small><strong>{l.value}</strong></div>
                ))}
              </div>
              {typeof r?.recommendationText === 'string' && <p style={{ marginTop: 12 }}>{r.recommendationText}</p>}
              {kind === 'STRESS' && Array.isArray(r?.plan) && (
                <>
                  <h3 style={{ fontSize: 15, margin: '14px 0 4px' }}>Plan preventivo</h3>
                  <ul className="cl-plan">{(r.plan as string[]).map((p) => <li key={p}>{p}</li>)}</ul>
                </>
              )}
              {kind === 'RENT_VS_BUY' && Array.isArray(r?.years) && (
                <details className="ov-details" style={{ marginTop: 12 }}>
                  <summary>Año a año</summary>
                  <div className="ov-tablewrap">
                    <table className="ov-table">
                      <thead><tr><th>Año</th><th className="num">Costo arrendar</th><th className="num">Costo comprar</th><th className="num">Patrimonio comprador</th><th className="num">Patrimonio arrendatario</th></tr></thead>
                      <tbody>
                        {(r.years as Array<Record<string, number>>).map((y) => (
                          <tr key={y.year}><td>{y.year}</td><td className="num">{pesos(y.rentCost)}</td><td className="num">{pesos(y.buyCost)}</td><td className="num">{pesos(y.buyerNetWorth)}</td><td className="num">{pesos(y.renterNetWorth)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              {[...extraWarnings, ...computed.output.warnings].length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {[...extraWarnings, ...computed.output.warnings].map((w) => <div className="ov-notice" key={w}>{w}</div>)}
                </div>
              )}
              <h3 style={{ fontSize: 14, margin: '14px 0 0' }}>Supuestos</h3>
              <ul className="ov-assumptions">{computed.output.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              <p className="ov-meta" style={{ marginTop: 8 }}><strong>{NOT_BINDING}</strong> Motor {computed.output.engineVersion}.</p>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>{computed.message}</p>
              <p className="ov-meta" style={{ marginTop: 8 }}>{NOT_BINDING}</p>
            </>
          )}
        </div>

        <KeepForm action={saveAction} className="ov-form ov-inline" ariaLabel="Guardar escenario">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="loanId" value={meta.needsLoan ? (loanId ?? '') : ''} />
          <input type="hidden" name="params" value={computed.params ? JSON.stringify(computed.params) : ''} />
          <div className="ov-field">
            <label htmlFor="sim-name" style={{ fontSize: 13.5, color: 'var(--ov-muted)', fontWeight: 600 }}>Nombre del escenario</label>
            <input id="sim-name" name="name" required maxLength={120} key={kind} defaultValue={`${meta.label} · ${isoText(today)}`} />
          </div>
          <Submit disabled={!computed.output} pendingText="Guardando…">Guardar escenario</Submit>
        </KeepForm>
        <p className="ov-meta">Al guardar, el servidor recalcula con tus datos registrados y guarda entradas, supuestos, versión del motor y una huella para reproducirlo.</p>
      </div>
    </article>
  );
}
