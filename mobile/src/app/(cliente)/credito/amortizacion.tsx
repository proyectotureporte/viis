import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CreditoResponse } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { decimal, fecha, pesos } from '@/services/format';
import { Bullets } from '@/ui/cliente/components';
import { Button, Card, Empty, ErrorState, Loading, Screen, T } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

export default function Amortizacion() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [page, setPage] = useState(1);
  const { data, error, loading, refreshing, refresh, reload } = useApi<CreditoResponse>(`/cliente/credito?${id ? `id=${id}&` : ''}pagina=${page}`);

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const sel = data?.selected;
  if (!sel || !sel.schedule) return <Screen><Empty>No podemos calcular la tabla con los datos actuales del crédito.</Empty></Screen>;

  const { table, loan, schedule } = sel;
  const uvr = loan.system === 'UVR';
  const cols: { key: string; label: string; w: number }[] = [
    { key: 'n', label: '#', w: 44 },
    { key: 'date', label: 'Fecha', w: 96 },
    { key: 'payment', label: 'Cuota', w: 104 },
    { key: 'principal', label: 'Capital', w: 104 },
    { key: 'interest', label: 'Intereses', w: 104 },
    { key: 'insurance', label: 'Seguros', w: 92 },
    { key: 'closing', label: 'Saldo final', w: 120 },
    ...(uvr ? [{ key: 'uvr', label: 'UVR proyectada', w: 110 }] : []),
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <T v="h2">{loan.alias}</T>
      <T v="small" style={{ marginTop: 4, marginBottom: 12 }}>
        Cronograma restante estimado con el motor OpenV ({schedule.months} cuotas). Página {table.page} de {table.pageCount}. Desliza la tabla hacia los lados.
      </T>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[s.tr, s.th]}>
              {cols.map((c) => <Text key={c.key} style={[s.cell, s.headText, { width: c.w }, c.key !== 'n' && c.key !== 'date' && s.num]}>{c.label}</Text>)}
            </View>
            {table.rows.map((r, i) => (
              <View key={r.n} style={[s.tr, i % 2 === 1 && { backgroundColor: colors.mist }]} accessible accessibilityLabel={`Cuota ${loan.paidInstallments + r.n}, ${fecha(r.date)}: ${pesos(r.payment)}; capital ${pesos(r.principal)}, intereses ${pesos(r.interest)}, seguros ${pesos(r.insurance)}, saldo ${pesos(r.closingBalance)}`}>
                <Text style={[s.cell, { width: 44 }]}>{loan.paidInstallments + r.n}</Text>
                <Text style={[s.cell, { width: 96 }]}>{fecha(r.date)}</Text>
                <Text style={[s.cell, s.num, { width: 104 }]}>{pesos(r.payment)}</Text>
                <Text style={[s.cell, s.num, { width: 104 }]}>{pesos(r.principal)}</Text>
                <Text style={[s.cell, s.num, { width: 104 }]}>{pesos(r.interest)}</Text>
                <Text style={[s.cell, s.num, { width: 92 }]}>{pesos(r.insurance)}</Text>
                <Text style={[s.cell, s.num, { width: 120 }]}>{pesos(r.closingBalance)}</Text>
                {uvr ? <Text style={[s.cell, s.num, { width: 110 }]}>{r.uvrValue !== undefined ? decimal(r.uvrValue, 4) : '—'}</Text> : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <Button small variant="secondary" title="← Anteriores" disabled={table.page <= 1 || loading} onPress={() => setPage(table.page - 1)} style={{ flex: 1 }} />
        <T v="small" style={{ textAlign: 'center', minWidth: 70 }}>{table.page} / {table.pageCount}</T>
        <Button small variant="secondary" title="Siguientes →" disabled={table.page >= table.pageCount || loading} onPress={() => setPage(table.page + 1)} style={{ flex: 1 }} />
      </View>
      <Card style={{ marginTop: 16 }}>
        <T v="eyebrow" style={{ marginBottom: 8 }}>Supuestos del cálculo · motor {schedule.engineVersion}</T>
        <Bullets items={[...schedule.assumptions, ...schedule.warnings]} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.mist },
  th: { backgroundColor: colors.sky },
  cell: { paddingHorizontal: 8, paddingVertical: 9, fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  headText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  num: { textAlign: 'right' },
});
