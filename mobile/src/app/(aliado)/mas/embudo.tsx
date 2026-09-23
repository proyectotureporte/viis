import type { AliadoEmbudoResponse } from '@/lib/movil/contract';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useApi } from '@/services/hooks';
import { pct, pesosCortos } from '@/services/format';
import { CaseCard, Chip } from '@/ui/aliado/parts';
import { duracion } from '@/ui/aliado/time';
import { Card, Empty, ErrorState, KeyValue, Loading, Notice, Pill, Progress, Screen, Section, T } from '@/ui/kit';
import { colors, radius, space } from '@/ui/theme';

export default function Embudo() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoEmbudoResponse>('/aliado/embudo');
  const [view, setView] = useState<'columnas' | 'lista'>('columnas');
  const { width } = useWindowDimensions();

  if (loading && !data) return <Screen scroll={false}><Loading /></Screen>;
  if (!data) return <Screen scroll={false}><ErrorState message={error ?? 'No pudimos cargar el embudo.'} onRetry={reload} /></Screen>;

  const max = Math.max(1, ...data.conversion.map((c) => c.reached));
  const columnWidth = Math.min(320, width - 64);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <T v="muted">{data.total === 1 ? '1 caso' : `${data.total} casos`}{data.admin ? ' de toda la organización' : ' en tu cartera'}.</T>

      <Section title="Conversión y tiempo por etapa">
        <Card style={{ gap: 12 }}>
          {data.conversion.map((c, i) => (
            <View key={c.stage} style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T v="h3" style={{ fontSize: 14.5 }}>{c.label}</T>
                <T v="small">{c.reached} {i > 0 && c.ofPrevious !== null ? `· ${pct(c.ofPrevious, 0)} de la anterior` : ''}</T>
              </View>
              <Progress value={(c.reached / max) * 100} color={i === data.conversion.length - 1 ? colors.mintDeep : colors.mint} />
              <T v="small" style={{ marginTop: -6 }}>Tiempo promedio en la etapa: {duracion(c.avgHoursInStage)}</T>
            </View>
          ))}
        </Card>
        <Card>
          <KeyValue
            items={[
              ['Desistidos', String(data.withdrawal.count)],
              ['Tasa de desistimiento', data.withdrawal.rate === null ? '—' : pct(data.withdrawal.rate, 0)],
            ]}
          />
          {data.withdrawal.reasons.length ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              <T v="eyebrow">Causas principales</T>
              {data.withdrawal.reasons.map((r) => (
                <View key={r.reason} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T v="small" style={{ flex: 1, color: colors.ink }}>{r.reason}</T>
                  <T v="small">{r.count}</T>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title="Casos por etapa">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Columnas" selected={view === 'columnas'} onPress={() => setView('columnas')} />
          <Chip label="Lista" selected={view === 'lista'} onPress={() => setView('lista')} />
        </View>
        {view === 'columnas' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={columnWidth + space.md} decelerationRate="fast" contentContainerStyle={{ gap: space.md, paddingRight: space.lg, alignItems: 'flex-start' }}>
            {data.columns.map((col) => (
              <View key={col.stage} style={[s.column, { width: columnWidth }]}>
                <View style={s.columnHead}>
                  <T v="h3" style={{ flex: 1 }}>{col.label}</T>
                  <Pill tone="gray">{col.count}</Pill>
                </View>
                <T v="small">{pesosCortos(col.amount)}</T>
                <View style={{ gap: space.sm, marginTop: space.sm }}>
                  {col.cases.length === 0 ? <T v="small">Sin casos.</T> : null}
                  {col.cases.map((c) => <CaseCard key={c.id} item={c} />)}
                  {col.more ? <T v="small">y {col.more} más: búscalos en Clientes con el filtro de etapa.</T> : null}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          data.columns.map((col) => (
            <View key={col.stage} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.sm }}>
                <T v="h3" style={{ flex: 1 }}>{col.label}</T>
                <T v="small">{col.count} · {pesosCortos(col.amount)}</T>
              </View>
              {col.cases.length === 0 ? <T v="small">Sin casos.</T> : col.cases.map((c) => <CaseCard key={c.id} item={c} />)}
              {col.more ? <T v="small">y {col.more} más.</T> : null}
            </View>
          ))
        )}
      </Section>

      <Section title="Desistidos recientes">
        {data.withdrawn.length === 0 ? <Empty>Sin casos desistidos.</Empty> : null}
        {data.withdrawn.map((w) => (
          <CaseCard key={w.id} item={{ id: w.id, code: w.code, clientName: w.clientName, productLabel: w.productLabel, sla: null, amount: null, disbursedAmount: null, allyName: null }} note={w.reason ? `Causa del desistimiento: ${w.reason}` : 'Sin causa registrada.'} />
        ))}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  column: { backgroundColor: colors.mist, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.md },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
