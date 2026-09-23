import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { EscenariosResponse, ScenarioView, SummaryLine } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { fechaHora } from '@/services/format';
import { Bullets } from '@/ui/cliente/components';
import { Card, Empty, ErrorState, Loading, Notice, Screen, Section, T } from '@/ui/kit';
import { colors, fonts, radius } from '@/ui/theme';

function merged(a: SummaryLine[], b: SummaryLine[]) {
  const labels = [...new Set([...a.map((l) => l.label), ...b.map((l) => l.label)])];
  return labels.map((label) => ({ label, a: a.find((l) => l.label === label)?.value ?? '—', b: b.find((l) => l.label === label)?.value ?? '—' }));
}

export default function Comparar() {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { data, error, loading, reload } = useApi<EscenariosResponse>('/cliente/escenarios');
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const A = data?.scenarios.find((x) => x.id === a);
  const B = data?.scenarios.find((x) => x.id === b);
  if (!data || !A || !B) return <Screen><Empty>No encontramos los dos escenarios para comparar.</Empty></Screen>;

  return (
    <Screen>
      <View style={s.heads}>
        <Head sc={A} tag="A" />
        <Head sc={B} tag="B" />
      </View>
      {A.kind !== B.kind ? <View style={{ marginTop: 12 }}><Notice tone="info">Son simulaciones de distinto tipo: compara con cuidado, cada una responde una pregunta diferente.</Notice></View> : null}
      <Section title="Resultados">
        <Compare rows={merged(A.summary, B.summary)} />
      </Section>
      <Section title="Datos usados">
        <Compare rows={merged(A.inputsSummary, B.inputsSummary)} />
      </Section>
      <Section title="Advertencias y supuestos">
        {[A, B].map((sc, i) => (
          <Card key={sc.id}>
            <T v="eyebrow" style={{ marginBottom: 8 }}>{i === 0 ? 'A' : 'B'} · {sc.name} · motor {sc.engineVersion}</T>
            {sc.warnings.length ? <Bullets items={sc.warnings} color={colors.amber} /> : null}
            <View style={{ marginTop: sc.warnings.length ? 8 : 0 }}><Bullets items={sc.assumptions} /></View>
          </Card>
        ))}
        <View style={s.nb}><T v="small" style={{ color: colors.ink, fontFamily: fonts.semibold }}>{data.notBinding}</T></View>
      </Section>
    </Screen>
  );
}

function Head({ sc, tag }: { sc: ScenarioView; tag: string }) {
  return (
    <Card style={{ flex: 1 }}>
      <T v="eyebrow">{tag} · {sc.kindLabel}</T>
      <T v="h3" style={{ marginTop: 4 }}>{sc.name}</T>
      <T v="small">{fechaHora(sc.createdAt)}</T>
    </Card>
  );
}

function Compare({ rows }: { rows: { label: string; a: string; b: string }[] }) {
  if (!rows.length) return <Empty>Sin datos para comparar.</Empty>;
  return (
    <Card style={{ padding: 0 }}>
      {rows.map((r, i) => (
        <View key={r.label} style={[s.row, i > 0 && { borderTopWidth: 1, borderColor: colors.mist }]}>
          <T v="small" style={{ marginBottom: 6 }}>{r.label}</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={s.cell}><T v="small" style={s.tag}>A</T><T v="h3" style={{ flex: 1 }}>{r.a}</T></View>
            <View style={s.cell}><T v="small" style={s.tag}>B</T><T v="h3" style={{ flex: 1 }}>{r.b}</T></View>
          </View>
        </View>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  heads: { flexDirection: 'row', gap: 10 },
  row: { padding: 14 },
  cell: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  tag: { fontFamily: fonts.bold, color: colors.mintDeep },
  nb: { padding: 12, borderRadius: radius.md, backgroundColor: colors.sky, borderWidth: 1, borderColor: '#c5e6e9' },
});
