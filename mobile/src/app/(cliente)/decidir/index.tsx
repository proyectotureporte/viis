import { CircleCheck, GitCompare } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EscenariosResponse } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { fechaHora } from '@/services/format';
import { go, R } from '@/ui/cliente/nav';
import { Button, Card, Empty, ErrorState, Loading, Notice, Pill, Screen, Section, T } from '@/ui/kit';
import { colors, fonts, radius } from '@/ui/theme';

export default function Decidir() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<EscenariosResponse>('/cliente/escenarios');
  const [compare, setCompare] = useState<string[] | null>(null);

  if (loading && !data) return <Screen title="Decidir"><Loading /></Screen>;
  if (error && !data) return <Screen title="Decidir"><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;

  const hasLoan = data.context.loans.some((l) => l.state);
  const toggle = (id: string) => {
    if (!compare) return;
    setCompare(compare.includes(id) ? compare.filter((x) => x !== id) : [...compare.slice(-1), id]);
  };

  return (
    <Screen title="Decidir" subtitle="Simula antes de decidir: abonos, plazo, compra de cartera y más. Calculado en tu teléfono con el mismo motor de la web." refreshing={refreshing} onRefresh={refresh}>
      <Notice tone="info">{data.notBinding}</Notice>
      <Section title="Simuladores">
        {!hasLoan ? <T v="small">Los simuladores marcados con “Usa tu crédito” necesitan tu crédito registrado con saldo y condiciones completas.</T> : null}
        <View style={s.grid}>
          {data.kinds.map((k) => (
            <Pressable key={k.kind} onPress={() => go(R.simular(k.kind))} style={({ pressed }) => [s.tile, k.kind === 'FREE_EARLY' && s.tileDark, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${k.label}. ${k.question}`}>
              <T v="h3" style={k.kind === 'FREE_EARLY' ? { color: colors.white } : undefined}>{k.label}</T>
              <T v="small" style={[{ marginTop: 4, flex: 1 }, k.kind === 'FREE_EARLY' && { color: '#c4d8dd' }]}>{k.question}</T>
              {k.needsLoan ? <T v="small" style={{ marginTop: 6, fontFamily: fonts.semibold, color: k.kind === 'FREE_EARLY' ? colors.mint : colors.mintDeep }}>Usa tu crédito</T> : null}
            </Pressable>
          ))}
        </View>
      </Section>

      <Section
        title="Mis escenarios"
        right={data.scenarios.length >= 2 ? <Button small variant={compare ? 'primary' : 'secondary'} title={compare ? 'Cancelar' : 'Comparar'} icon={<GitCompare size={16} color={colors.ink} />} onPress={() => setCompare(compare ? null : [])} /> : undefined}
      >
        {compare ? (
          <Card>
            <T v="small">Elige dos escenarios ({compare.length}/2).</T>
            <Button title="Comparar lado a lado" disabled={compare.length !== 2} onPress={() => go(R.comparar(compare[0], compare[1]))} style={{ marginTop: 10 }} />
          </Card>
        ) : null}
        {data.scenarios.length === 0 ? (
          <Empty>Aún no guardas escenarios. Abre un simulador, ajusta los datos y toca “Guardar escenario” para compararlo, descargarlo en PDF o compartirlo con un asesor.</Empty>
        ) : (
          data.scenarios.map((sc) => {
            const selected = compare?.includes(sc.id);
            return (
              <Card key={sc.id} onPress={() => (compare ? toggle(sc.id) : go(R.escenario(sc.id)))} style={selected ? { borderColor: colors.mintDeep, borderWidth: 2 } : undefined}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  {compare ? <CircleCheck size={22} color={selected ? colors.mintDeep : colors.line} /> : null}
                  <View style={{ flex: 1 }}>
                    <T v="h3">{sc.name}</T>
                    <T v="small">{sc.kindLabel} · {fechaHora(sc.createdAt)}</T>
                    {sc.summary[0] ? <T v="small" style={{ marginTop: 6, color: colors.ink }}>{sc.summary[0].label}: <T v="small" style={{ fontFamily: fonts.bold, color: colors.ink }}>{sc.summary[0].value}</T></T> : null}
                  </View>
                  {sc.sharedWithAdvisor ? <Pill tone="info">Con asesor</Pill> : null}
                </View>
              </Card>
            );
          })
        )}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, minHeight: 128, padding: 14, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  tileDark: { backgroundColor: colors.navy, borderColor: colors.navy },
});
