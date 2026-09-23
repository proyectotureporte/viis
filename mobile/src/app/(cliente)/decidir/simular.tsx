import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isoText, rateText } from '@/lib/cliente/format';
import { describeLoan, runSimulation, SIM_KINDS, SIM_META, summarizeResults, type SimKind, type SimOutput, type SimParams } from '@/lib/cliente/simulate';
import type { LoanState } from '@/lib/finance/types';
import type { EscenariosResponse, ParametrosResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { fecha, milesInput, pesos } from '@/services/format';
import { Bullets, Chip, DateField, dateProblem, Lines, SimDisclosure } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { FIELDS, simDefaults, toParams, type SimField } from '@/ui/cliente/sims';
import { Button, Card, Confidence, ErrorState, Field, Loading, Notice, ResultBanner, Screen, Section, Select, T } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

const isKind = (v: unknown): v is SimKind => typeof v === 'string' && (SIM_KINDS as readonly string[]).includes(v);

export default function Simular() {
  const { sim } = useLocalSearchParams<{ sim?: string }>();
  const esc = useApi<EscenariosResponse>('/cliente/escenarios');
  const par = useApi<ParametrosResponse>('/cliente/parametros');

  if ((esc.loading && !esc.data) || (par.loading && !par.data)) return <Screen><Loading label="Preparando el simulador…" /></Screen>;
  if (esc.error && !esc.data) return <Screen><ErrorState message={esc.error} onRetry={esc.reload} /></Screen>;
  if (!esc.data) return null;
  return <Simulator ctx={esc.data} params={par.data} initialKind={isKind(sim) ? sim : 'PREPAYMENT'} onSaved={esc.reload} />;
}

function Simulator({ ctx: data, params: par, initialKind, onSaved }: { ctx: EscenariosResponse; params: ParametrosResponse | null; initialKind: SimKind; onSaved: () => void }) {
  const ctx = data.context;
  const [kind, setKind] = useState<SimKind>(initialKind);
  const firstUsable = ctx.loans.find((l) => l.state) ?? ctx.loans[0] ?? null;
  const [loanId, setLoanId] = useState<string | undefined>(firstUsable?.id);
  const loan = ctx.loans.find((l) => l.id === loanId) ?? null;
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const key = `${kind}:${loanId ?? ''}`;
  const current = values[key] ?? simDefaults(kind, ctx, loan);
  const setValue = (name: string, v: string) => setValues((all) => ({ ...all, [key]: { ...current, [name]: v } }));
  const meta = SIM_META[kind];
  const save = useAction();
  const [names, setNames] = useState<Record<string, string>>({});
  const name = names[kind] ?? `${meta.label} · ${isoText(ctx.today)}`;
  const [savedId, setSavedId] = useState<string | null>(null);

  const computed = useMemo((): { output?: SimOutput; params?: SimParams; message?: string } => {
    if (meta.needsLoan && !loan?.state) return { message: loan ? loan.notices[0] ?? 'Completa los datos del crédito para simular.' : 'Registra tu crédito para usar esta simulación.' };
    const dateField = FIELDS[kind].find((f) => f.type === 'date');
    if (dateField && current[dateField.name] && dateProblem(current[dateField.name])) return { message: `${dateField.label}: elige una fecha válida.` };
    const { params, missing } = toParams(kind, current);
    if (!params) return { message: `Completa: ${missing.join(', ')}.` };
    try {
      return { output: runSimulation(kind, params, meta.needsLoan ? (loan!.state as LoanState) : null), params };
    } catch (error) {
      return { message: error instanceof Error ? error.message : 'Revisa los datos.' };
    }
  }, [kind, current, loan, meta.needsLoan]);

  const lines = computed.output ? summarizeResults(kind, computed.output.results) : [];
  const r = computed.output?.results;
  const extraWarnings: string[] = [];
  const { income, expenses, savings } = ctx.household;
  if (r && kind === 'FREE_EARLY' && income !== null && expenses !== null && loan?.payment) {
    const margin = income - expenses - loan.payment;
    if (Number(r.monthlyExtra) > margin) extraWarnings.push(`El abono mensual necesario supera tu margen mensual declarado (${pesos(margin)}). Una fecha más lejana puede ser más realista.`);
  }
  if (r && kind === 'PREPAYMENT' && savings !== null && loan?.payment) {
    const amount = Number((computed.params as { amount?: number } | undefined)?.amount ?? 0);
    if (savings - amount < 3 * loan.payment) extraWarnings.push(`Después de este abono tu ahorro declarado quedaría por debajo de 3 cuotas (${pesos(3 * loan.payment)}). Conserva un colchón antes de abonar.`);
  }

  async function doSave() {
    if (!computed.params) return;
    setSavedId(null);
    const res = await save.run('/cliente/escenarios', { kind, name: name.trim(), ...(meta.needsLoan && loanId ? { loanId } : {}), params: computed.params as unknown as Record<string, unknown> });
    if (res.ok) {
      if (typeof res.id === 'string') setSavedId(res.id);
      onSaved();
    }
  }

  return (
    <Screen>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} accessibilityRole="tablist">
        {SIM_KINDS.map((k) => <Chip key={k} label={SIM_META[k].label} active={k === kind} onPress={() => { setKind(k); save.clear(); setSavedId(null); }} />)}
      </ScrollView>

      <T v="h2" style={{ marginTop: 16 }}>{meta.question}</T>

      {meta.needsLoan && ctx.loans.length > 1 ? (
        <View style={{ marginTop: 12 }}>
          <Select label="Crédito" value={loanId} options={ctx.loans.map((l) => ({ value: l.id, label: l.alias }))} onChange={setLoanId} />
        </View>
      ) : null}
      {meta.needsLoan && loan?.state ? (
        <Card style={{ marginTop: 12 }}>
          <T v="eyebrow" style={{ marginBottom: 8 }}>Con tu crédito {loan.alias}</T>
          <Lines lines={describeLoan(loan.state as LoanState)} />
          <Confidence level="DECLARED" source="Declarado por ti" />
        </Card>
      ) : null}
      {meta.needsLoan && !loan ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Notice tone="info">Esta simulación usa los datos de tu crédito. Regístralo para simular.</Notice>
          <Button title="Registrar mi crédito" onPress={() => go(R.creditoEditar())} />
        </View>
      ) : null}
      {kind === 'PORTFOLIO' && ctx.refRate ? (
        <T v="small" style={{ marginTop: 10 }}>Tasa de referencia sugerida: {rateText(ctx.refRate.rateEa)} EA ({ctx.refRate.source}, {isoText(ctx.refRate.asOf)}). Puedes cambiarla por la de una oferta real.</T>
      ) : null}
      {kind === 'SALE' && ctx.home ? <T v="small" style={{ marginTop: 10 }}>Precio sugerido: tu último valor registrado ({ctx.home.source}, {isoText(ctx.home.asOf)}). No es un avalúo.</T> : null}

      <View style={{ gap: 14, marginTop: 16 }}>
        {FIELDS[kind]
          .filter((f) => !f.showIf || f.showIf(current))
          .map((f) => <SimInput key={f.name} field={f} value={current[f.name] ?? ''} onChange={(v) => setValue(f.name, v)} today={ctx.today} />)}
      </View>

      <Section title="Resultado">
        {computed.output ? (
          <>
            <Card style={{ borderColor: colors.mint, borderWidth: 1.5 }} >
              <Lines lines={lines} />
              {typeof r?.recommendationText === 'string' ? <T style={{ marginTop: 12 }}>{r.recommendationText}</T> : null}
            </Card>
            {kind === 'STRESS' && Array.isArray(r?.plan) ? (
              <Card>
                <T v="h3" style={{ marginBottom: 8 }}>Plan preventivo</T>
                <Bullets items={r.plan as string[]} color={colors.ink} />
              </Card>
            ) : null}
            {kind === 'RENT_VS_BUY' && Array.isArray(r?.years) ? <YearTable years={r.years as Record<string, number>[]} /> : null}
            <SimDisclosure warnings={[...extraWarnings, ...computed.output.warnings]} assumptions={computed.output.assumptions} notBinding={data.notBinding} engineVersion={computed.output.engineVersion} />
          </>
        ) : (
          <>
            <Card><T>{computed.message}</T></Card>
            <SimDisclosure warnings={[]} assumptions={[]} notBinding={data.notBinding} />
          </>
        )}
      </Section>

      <Section title="Guardar escenario">
        <Card>
          <Field label="Nombre del escenario" value={name} onChangeText={(t) => setNames((n) => ({ ...n, [kind]: t }))} maxLength={120} />
          <T v="small" style={{ marginTop: 8 }}>Al guardar, el servidor recalcula con tus datos registrados y guarda entradas, supuestos, versión del motor y una huella para reproducirlo.</T>
          <View style={{ marginTop: 12, gap: 10 }}>
            <ResultBanner result={save.result} />
            <Button title="Guardar escenario" onPress={doSave} loading={save.pending} disabled={!computed.output || !name.trim()} />
            {savedId ? <Button variant="secondary" title="Ver escenario guardado" onPress={() => go(R.escenario(savedId))} /> : null}
          </View>
        </Card>
      </Section>

      {par ? (
        <Section title="Parámetros de mercado">
          <Card>
            <Lines
              lines={[
                { label: 'UVR', value: par.uvr ? `${String(par.uvr.value).replace('.', ',')} (${par.uvr.source}, ${fecha(par.uvr.asOf)})` : 'No cargada' },
                { label: 'Inflación proyectada', value: par.inflation ? `${rateText(par.inflation.value)} (${par.inflation.source}, ${fecha(par.inflation.asOf)})` : 'No cargada' },
                { label: 'Tasa de referencia en pesos', value: par.referenceRates.FIXED_PESOS ? `${rateText(par.referenceRates.FIXED_PESOS.rateEa)} EA (${par.referenceRates.FIXED_PESOS.source}, ${fecha(par.referenceRates.FIXED_PESOS.asOf)})` : 'Sin dato vigente' },
                { label: 'Tasa de referencia UVR', value: par.referenceRates.UVR ? `${rateText(par.referenceRates.UVR.rateEa)} EA (${par.referenceRates.UVR.source}, ${fecha(par.referenceRates.UVR.asOf)})` : 'Sin dato vigente' },
              ]}
            />
            <T v="small" style={{ marginTop: 8 }}>Motor de cálculo {par.engineVersion}: el mismo de la web. Los cálculos se hacen en tu teléfono.</T>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

function SimInput({ field, value, onChange, today }: { field: SimField; value: string; onChange: (v: string) => void; today: string }) {
  if (field.type === 'select') {
    return <Select label={field.label} value={value} options={field.options!.map(([v, l]) => ({ value: v, label: l }))} onChange={onChange} />;
  }
  if (field.type === 'date') {
    return <DateField label={field.label} value={value} onChange={onChange} hint={field.help} error={value ? dateProblem(value) : undefined} shortcuts={[{ label: 'Hoy', value: today }]} />;
  }
  if (field.type === 'money') {
    return <Field label={field.label} value={value} onChangeText={(t) => onChange(milesInput(t))} keyboardType="number-pad" hint={field.help} placeholder={field.optional ? 'Opcional' : undefined} />;
  }
  return (
    <Field
      label={field.label}
      value={value}
      onChangeText={(t) => onChange(field.type === 'int' ? t.replace(/\D/g, '') : t.replace(/[^\d,.-]/g, ''))}
      keyboardType={field.type === 'pct' ? 'decimal-pad' : 'number-pad'}
      hint={field.help}
      placeholder={field.optional ? 'Opcional' : undefined}
    />
  );
}

function YearTable({ years }: { years: Record<string, number>[] }) {
  const cols = [
    { k: 'year', l: 'Año', w: 48 },
    { k: 'rentCost', l: 'Costo arrendar', w: 120 },
    { k: 'buyCost', l: 'Costo comprar', w: 120 },
    { k: 'buyerNetWorth', l: 'Patrimonio comprador', w: 140 },
    { k: 'renterNetWorth', l: 'Patrimonio arrendatario', w: 150 },
  ];
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <T v="h3" style={{ padding: 14, paddingBottom: 6 }}>Año a año</T>
      <ScrollView horizontal>
        <View>
          <View style={[s.tr, { backgroundColor: colors.sky }]}>
            {cols.map((c) => <Text key={c.k} style={[s.cell, s.head, { width: c.w }, c.k !== 'year' && s.num]}>{c.l}</Text>)}
          </View>
          {years.map((y) => (
            <View key={y.year} style={s.tr}>
              {cols.map((c) => <Text key={c.k} style={[s.cell, { width: c.w }, c.k !== 'year' && s.num]}>{c.k === 'year' ? y.year : pesos(y[c.k])}</Text>)}
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

const s = StyleSheet.create({
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.mist },
  cell: { paddingHorizontal: 8, paddingVertical: 8, fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  head: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  num: { textAlign: 'right' },
});
