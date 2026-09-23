import type { AliadoComisionesResponse } from '@/lib/movil/contract';
import { ChevronDown, ChevronUp, Download } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApi } from '@/services/hooks';
import { fecha, hoyIso, pct, pesos, pesosCortos } from '@/services/format';
import { downloadAndShare, DownloadError } from '@/ui/aliado/files';
import { HeaderActions } from '@/ui/aliado/HeaderActions';
import { goToCase, toneOf } from '@/ui/aliado/parts';
import { Button, Card, Empty, ErrorState, Grid, KeyValue, Loading, Notice, Pill, ResultBanner, Screen, Section, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

type Commission = AliadoComisionesResponse['commissions'][number];

function Paso({ n, label, value, strong }: { n: string; label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.paso}>
      <View style={s.pasoN}><T v="small" style={{ color: colors.navy, fontFamily: fonts.bold }}>{n}</T></View>
      <T v="small" style={{ flex: 1, color: colors.ink }}>{label}</T>
      <T v="h3" style={strong ? { fontFamily: fonts.bold } : undefined}>{value}</T>
    </View>
  );
}

function Liquidacion({ c }: { c: Commission }) {
  const withholdingPct = c.rule.withholdingPct;
  const reconstructed = Math.round(c.baseAmount * c.percent);
  return (
    <View style={{ gap: space.md, marginTop: space.md }}>
      <T v="eyebrow">Cálculo paso a paso</T>
      <View style={{ gap: 6 }}>
        <Paso n="1" label={`Base: ${c.rule.basisLabel.toLowerCase()}`} value={pesos(c.baseAmount)} />
        <Paso n="2" label={`× ${pct(c.percent, 2)} de la regla = bruto`} value={pesos(c.gross)} />
        <Paso n="3" label={`− Retención${withholdingPct !== null ? ` (${pct(withholdingPct, 2)} del bruto)` : ''}`} value={`−${pesos(c.withholding)}`} />
        <Paso n="4" label="= Neto a pagar" value={pesos(c.net)} strong />
      </View>
      {Math.abs(reconstructed - c.gross) > 1 || Math.abs(c.gross - c.withholding - c.net) > 1 ? (
        <Notice tone="wait">El bruto o el neto registrados no coinciden con base × porcentaje − retención. Escribe a contacto@viis.app con el caso {c.case.code}.</Notice>
      ) : null}
      <T v="eyebrow">Regla aplicada (foto al causar)</T>
      <KeyValue
        items={[
          ['Regla', `${c.rule.name}${c.rule.version !== null ? ` · v${c.rule.version}` : ''}`],
          ['Alcance', c.rule.scope],
          ['Vigencia', c.rule.validFrom ? `${fecha(c.rule.validFrom)} – ${c.rule.validTo ? fecha(c.rule.validTo) : 'sin fin'}` : '—'],
          ['Plazo de pago', c.rule.paymentDays !== null ? `${c.rule.paymentDays} días` : '—'],
        ]}
      />
      <T v="eyebrow">Caso y fechas</T>
      <KeyValue
        items={[
          ['Entidad', c.case.entityName ?? '—'],
          ['Desembolsado', c.case.disbursedAmount ? `${pesos(c.case.disbursedAmount)}${c.case.disbursedAt ? ` · ${fecha(c.case.disbursedAt)}` : ''}` : '—'],
          ['Causada', fecha(c.causedAt)],
          ['Aprobada', fecha(c.approvedAt)],
          ['Pago previsto', fecha(c.expectedPayAt)],
          ['Pagada', fecha(c.paidAt)],
          ['Referencia de pago', c.paymentRef ?? '—'],
          ...(c.allyName ? [['Aliado', c.allyName] as [string, string]] : []),
        ]}
      />
      {c.reversedAt ? <Notice tone="bad">Reversada el {fecha(c.reversedAt)}{c.reverseReason ? `: ${c.reverseReason}` : '.'}</Notice> : null}
      <Button small variant="secondary" title={`Ver caso ${c.case.code}`} onPress={() => goToCase(c.case.id)} />
    </View>
  );
}

export default function Comisiones() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoComisionesResponse>('/aliado/comisiones');
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);

  const right = <HeaderActions />;
  if (loading && !data) return <Screen title="Comisiones" right={right} scroll={false}><Loading /></Screen>;
  if (!data) return <Screen title="Comisiones" right={right} scroll={false}><ErrorState message={error ?? 'No pudimos cargar tus comisiones.'} onRetry={reload} /></Screen>;

  async function exportCsv() {
    if (!data) return;
    setExporting(true);
    setBanner(null);
    try {
      await downloadAndShare(data.csvUrl, { fileName: `comisiones-openv-${hoyIso()}.csv`, mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exportar comisiones' });
    } catch (e) {
      setBanner({ ok: false, message: e instanceof DownloadError ? e.message : 'No pudimos exportar el archivo.' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen
      title="Comisiones"
      subtitle={data.organization ? `${data.organization.name} · ${data.organization.tierLabel}${data.admin ? ' · toda la organización' : ''}` : undefined}
      right={right}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Grid>
        {data.totals.map((t) => (
          <Card key={t.status} style={{ flexBasis: '46%', flexGrow: 1 }}>
            <T v="eyebrow">{t.label}</T>
            <T v="big" style={{ fontSize: 21, marginTop: 4 }}>{pesosCortos(t.net)}</T>
            <T v="small">{t.count === 1 ? '1 comisión' : `${t.count} comisiones`}</T>
          </Card>
        ))}
      </Grid>

      <Section title="Liquidaciones" right={data.commissions.length ? <Button small variant="secondary" title="CSV" icon={<Download size={15} color={colors.ink} />} loading={exporting} onPress={exportCsv} /> : undefined}>
        <ResultBanner result={banner} />
        {data.commissions.length === 0 ? <Empty>Aún no tienes comisiones. Se causan automáticamente cuando un caso se desembolsa.</Empty> : null}
        {data.commissions.map((c) => {
          const expanded = open === c.id;
          return (
            <Card key={c.id}>
              <Pressable onPress={() => setOpen(expanded ? null : c.id)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`Comisión de ${c.case.clientName}, ${pesos(c.net)}`}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <T v="h3" numberOfLines={1}>{c.case.clientName}</T>
                    <T v="small">{c.case.code} · {c.case.productLabel}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <T v="h3" style={{ fontFamily: fonts.bold }}>{pesos(c.net)}</T>
                    <Pill tone={toneOf(c.status.tone)}>{c.status.label}</Pill>
                  </View>
                  {expanded ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}
                </View>
              </Pressable>
              {expanded ? <Liquidacion c={c} /> : null}
            </Card>
          );
        })}
      </Section>

      <Section title="Reglas vigentes para mí">
        {data.rules.length === 0 ? <Empty>Tu usuario no está vinculado a una organización aliada.</Empty> : null}
        {data.rules.map((r) => (
          <Card key={r.product} style={{ gap: 8 }}>
            <T v="h3">{r.productLabel}</T>
            {r.rule ? (
              <>
                <KeyValue
                  items={[
                    ['Regla', `${r.rule.name} · v${r.rule.version}`],
                    ['Porcentaje', pct(r.rule.percent, 2)],
                    ['Retención', pct(r.rule.withholdingPct, 2)],
                    ['Plazo de pago', `${r.rule.paymentDays} días`],
                    ['Vigencia', `${fecha(r.rule.validFrom)} – ${r.rule.validTo ? fecha(r.rule.validTo) : 'sin fin'}`],
                  ]}
                />
                <View style={s.example}>
                  <T v="small" style={{ color: colors.ink }}>
                    Ejemplo con {pesos(data.exampleBase)} desembolsados: {pesos(data.exampleBase)} × {pct(r.rule.percent, 2)} = {pesos(Math.round(data.exampleBase * r.rule.percent))} − retención {pesos(Math.round(data.exampleBase * r.rule.percent) - r.rule.exampleNet)} = {pesos(r.rule.exampleNet)} netos.
                  </T>
                </View>
              </>
            ) : (
              <T v="small">Sin regla vigente para este producto.</T>
            )}
          </Card>
        ))}
        <T v="small">La comisión se calcula con la regla vigente al crear el caso y queda congelada al causarse: los cambios posteriores no la alteran.</T>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  paso: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.mist },
  pasoN: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' },
  example: { backgroundColor: colors.sky, borderRadius: radius.md, padding: 12 },
});
