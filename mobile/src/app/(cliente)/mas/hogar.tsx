import { useState } from 'react';
import { View } from 'react-native';
import type { HogarResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { fecha, milesInput, pesos, soloDigitos } from '@/services/format';
import { Button, Card, Checkbox, Confidence, ErrorState, Field, KeyValue, Loading, MoneyField, ResultBanner, Screen, Section, T } from '@/ui/kit';

export default function Hogar() {
  const { data, error, loading, reload } = useApi<HogarResponse>('/cliente/hogar');
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;
  return <HouseholdForm data={data} onSaved={reload} />;
}

const money = (n: number | null) => (n === null ? '' : milesInput(String(n)) || '0');

function HouseholdForm({ data, onSaved }: { data: HogarResponse; onSaved: () => void }) {
  const [goals, setGoals] = useState<string[]>(data.goals.filter((g) => g.selected).map((g) => g.code));
  const [note, setNote] = useState(data.goalsNote);
  const [income, setIncome] = useState(money(data.monthlyIncome));
  const [expenses, setExpenses] = useState(money(data.monthlyExpenses));
  const [savings, setSavings] = useState(money(data.savings));
  const [city, setCity] = useState(data.city ?? '');
  const action = useAction();
  const margin = income && expenses ? soloDigitos(income) - soloDigitos(expenses) : null;

  async function submit() {
    const res = await action.run('/cliente/hogar', { goals, goalsNote: note.trim(), monthlyIncome: income, monthlyExpenses: expenses, savings, city: city.trim() });
    if (res.ok) onSaved();
  }

  return (
    <Screen>
      <T v="muted">Con tus objetivos y las finanzas del hogar ajustamos tus recomendaciones. Sin ingresos y gastos no te sugerimos abonos ni cambios.</T>
      <Confidence level={data.confidence} source="Declarado por ti" asOf={`actualizado ${fecha(data.updatedAt)}`} />

      <Section title="Tus objetivos">
        <Card>
          <View style={{ gap: 12 }}>
            {data.goals.map((g) => (
              <Checkbox key={g.code} checked={goals.includes(g.code)} onChange={(on) => setGoals(on ? [...goals, g.code] : goals.filter((x) => x !== g.code))}>{g.label}</Checkbox>
            ))}
          </View>
          <Field label="Algo más que quieras contarnos (opcional)" value={note} onChangeText={setNote} multiline maxLength={500} style={{ marginTop: 14 }} />
        </Card>
      </Section>

      <Section title="Finanzas del hogar">
        <MoneyField label="Ingreso mensual del hogar ($)" value={income} onChangeText={setIncome} placeholder="6.500.000" hint="Lo que entra al mes sumando a quienes aportan, después de descuentos." />
        <MoneyField label="Gastos mensuales sin la cuota del crédito ($)" value={expenses} onChangeText={setExpenses} placeholder="3.200.000" hint="Servicios, alimentación, transporte, educación, otras deudas." />
        <MoneyField label="Ahorros disponibles ($)" value={savings} onChangeText={setSavings} placeholder="0" hint="Lo que podrías usar en una emergencia." />
        <Field label="Ciudad donde vives" value={city} onChangeText={setCity} maxLength={120} />
        {margin !== null ? (
          <Card>
            <KeyValue items={[['Margen antes de la cuota', pesos(margin)]]} />
          </Card>
        ) : null}
      </Section>

      <View style={{ gap: 12, marginTop: 20 }}>
        <ResultBanner result={action.result} />
        <Button title="Guardar" onPress={submit} loading={action.pending} />
      </View>
    </Screen>
  );
}
