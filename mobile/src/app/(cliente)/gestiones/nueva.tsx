import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { summarizeResults } from '@/lib/cliente/simulate';
import { simulateStress } from '@/lib/finance/simulators';
import type { EscenariosResponse, GestionesResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { milesInput, pesos, soloDigitos } from '@/services/format';
import { Bullets, Lines, SimDisclosure } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { Button, Card, ErrorState, Field, Loading, Notice, ResultBanner, Screen, Section, Select, T } from '@/ui/kit';
import { colors } from '@/ui/theme';

const slaText = (hours: number) => (hours >= 48 ? `${Math.round(hours / 24)} días` : `${hours} horas`);

export default function NuevaSolicitud() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const g = useApi<GestionesResponse>('/cliente/gestiones');
  const e = useApi<EscenariosResponse>('/cliente/escenarios');
  if ((g.loading && !g.data) || (e.loading && !e.data)) return <Screen><Loading /></Screen>;
  if (g.error && !g.data) return <Screen><ErrorState message={g.error} onRetry={g.reload} /></Screen>;
  if (!g.data) return null;
  const initial = g.data.requestKinds.some((k) => k.code === params.kind) ? params.kind! : '';
  return <RequestForm kinds={g.data.requestKinds} ctx={e.data} initialKind={initial} />;
}

function RequestForm({ kinds, ctx, initialKind }: { kinds: GestionesResponse['requestKinds']; ctx: EscenariosResponse | null; initialKind: string }) {
  const [kind, setKind] = useState(initialKind);
  const meta = kinds.find((k) => k.code === kind);
  const hardship = kind === 'HARDSHIP';
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const subject = subjects[kind] ?? (hardship ? 'Necesito acompañamiento para pagar mi crédito' : meta?.label ?? '');
  const [detail, setDetail] = useState('');
  const [drop, setDrop] = useState('');
  const [expense, setExpense] = useState('');
  const action = useAction();
  const [createdId, setCreatedId] = useState<string | null>(null);

  const h = ctx?.context.household;
  const hasHousehold = Boolean(h && h.income !== null && h.expenses !== null);
  const payment = (ctx?.context.loans ?? []).reduce((a, l) => a + (l.payment ?? 0), 0);
  const dropPct = Math.min(100, Math.max(0, Number(drop.replace(',', '.')) || 0));
  const newExpense = soloDigitos(expense);

  // Modo Tranquilidad: la misma simulación de estrés de la web, calculada en el teléfono.
  const stress = useMemo(() => {
    if (!hardship || !h || h.income === null || h.expenses === null) return null;
    try {
      return simulateStress({ monthlyIncome: h.income, monthlyExpenses: h.expenses, payment, savings: h.savings ?? 0, incomeDropPct: dropPct / 100, newExpense });
    } catch {
      return null;
    }
  }, [hardship, h, payment, dropPct, newExpense]);

  async function submit() {
    setCreatedId(null);
    const res = await action.run('/cliente/solicitudes', {
      kind,
      subject: subject.trim(),
      detail: detail.trim(),
      ...(hardship ? { incomeDrop: String(dropPct), newExpense: String(newExpense) } : {}),
    });
    if (res.ok) {
      setDetail('');
      if (typeof res.id === 'string') setCreatedId(res.id);
    }
  }

  return (
    <Screen>
      <Select
        label="¿Qué necesitas?"
        value={kind}
        options={kinds.map((k) => ({ value: k.code, label: k.code === 'HARDSHIP' ? 'Modo Tranquilidad: tengo dificultades para pagar' : k.label, hint: `Respuesta en máximo ${slaText(k.slaHours)}` }))}
        onChange={(v) => { setKind(v); action.clear(); setCreatedId(null); }}
        placeholder="Elige el tipo de solicitud"
      />
      {!kind ? <T v="small" style={{ marginTop: 10 }}>Cada tipo tiene un tiempo máximo de respuesta y queda con código para su seguimiento.</T> : null}

      {hardship ? (
        <Section title="Modo Tranquilidad">
          <Card dark>
            <T style={{ color: '#dbe9ec' }}>Si tu ingreso bajó o apareció un gasto, lo mejor es actuar antes de atrasarte. Mira cómo queda tu presupuesto y envíanos tu caso: una persona del equipo te acompaña.</T>
          </Card>
          {!hasHousehold ? (
            <View style={{ gap: 8 }}>
              <Notice>Para calcular tu escenario registra tus ingresos y gastos. Igual puedes enviar la solicitud ahora.</Notice>
              <Button small variant="secondary" title="Registrar ingresos y gastos" onPress={() => go(R.hogar)} />
            </View>
          ) : (
            <>
              <Field label="¿Cuánto bajó tu ingreso? (%)" value={drop} onChangeText={(t) => setDrop(t.replace(/[^\d,.]/g, ''))} keyboardType="decimal-pad" placeholder="0" hint="Si perdiste todo el ingreso, escribe 100." />
              <Field label="Gasto nuevo mensual ($)" value={expense} onChangeText={(t) => setExpense(milesInput(t))} keyboardType="number-pad" placeholder="0" />
              {stress ? (
                <>
                  <Card style={{ borderColor: colors.mint, borderWidth: 1.5 }}>
                    <Lines lines={summarizeResults('STRESS', stress.results as unknown as Record<string, unknown>).slice(0, 6)} />
                  </Card>
                  <Card>
                    <T v="h3" style={{ marginBottom: 8 }}>Plan preventivo sugerido</T>
                    <Bullets items={stress.results.plan} color={colors.ink} />
                    <T v="small" style={{ marginTop: 10 }}>Cuota usada: {pesos(payment)} (estimada con tus créditos registrados) · Datos declarados por ti.</T>
                  </Card>
                  <SimDisclosure warnings={stress.warnings} assumptions={stress.assumptions} notBinding={ctx?.notBinding ?? ''} engineVersion={stress.engineVersion} />
                </>
              ) : null}
            </>
          )}
        </Section>
      ) : null}

      {kind ? (
        <Section title="Tu solicitud">
          <Field label="Asunto" value={subject} onChangeText={(t) => setSubjects((s) => ({ ...s, [kind]: t }))} maxLength={200} />
          <Field
            label="Cuéntanos qué necesitas"
            value={detail}
            onChangeText={setDetail}
            multiline
            maxLength={4000}
            placeholder={hardship ? 'Qué cambió, desde cuándo y qué te preocupa. No necesitas justificarte: queremos ayudarte a tiempo.' : 'Entre más detalle, más rápido te respondemos.'}
            hint={detail.trim().length > 0 && detail.trim().length < 10 ? 'Escribe al menos 10 caracteres.' : undefined}
          />
          {meta ? <T v="small">Tiempo máximo de respuesta: {slaText(meta.slaHours)}. Te avisamos por correo y en la campana.{hardship ? ' Con tu solicitud enviamos el resumen de este escenario al equipo.' : ''}</T> : null}
          <ResultBanner result={action.result} />
          <Button title="Enviar solicitud" onPress={submit} loading={action.pending} disabled={subject.trim().length < 4 || detail.trim().length < 10} />
          {createdId ? <Button variant="secondary" title="Ver la solicitud" onPress={() => go(R.solicitud(createdId))} /> : null}
        </Section>
      ) : null}
    </Screen>
  );
}
