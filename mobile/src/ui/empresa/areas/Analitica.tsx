import { useState } from 'react';
import { View } from 'react-native';
import type { AnaliticaResponse, ConversionRowView } from '@/lib/movil/contract-empresa';
import { decimal, fecha, hoyIso, pct, pesosCortos } from '@/services/format';
import { Button, Card, Empty, Notice, Section, T } from '@/ui/kit';
import { DateField } from '@/ui/DateField';
import { colors, fonts, space } from '@/ui/theme';
import { qs, useLoad } from '../hooks';
import { Bars, Chip, ChipRow, Funnel, Line, Loadable, Page, Stat, StatGrid } from '../ui';
import type { AreaProps } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ratio = (v: number | null, d = 1) => (v === null ? '—' : pct(v, d));
const hours = (h: number) => (h < 48 ? `${decimal(h, 1)} h` : `${decimal(h / 24, 1)} d`);

function daysAgo(n: number) {
  return new Date(Date.now() - 5 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
}

function Conversion({ rows }: { rows: ConversionRowView[] }) {
  if (!rows.length) return <Empty>Sin casos en el rango.</Empty>;
  return (
    <Card>
      <Bars
        items={rows.map((r) => ({
          label: r.label,
          value: r.createdToDisbursed ?? 0,
          display: ratio(r.createdToDisbursed),
          sub: `${r.total} casos · ${r.filed} radicados · ${r.disbursed} desembolsados (${pesosCortos(r.disbursedAmount)}) · radicado→desembolso ${ratio(r.filedToDisbursed)}`,
        }))}
        max={1}
      />
    </Card>
  );
}

export function AnaliticaArea({ tab, title, header }: AreaProps) {
  const [preset, setPreset] = useState<'30' | '90' | '180' | 'custom'>('90');
  const [desde, setDesde] = useState(daysAgo(90));
  const [hasta, setHasta] = useState(hoyIso());
  const [applied, setApplied] = useState({ desde: daysAgo(90), hasta: hoyIso() });
  const [conv, setConv] = useState<'byChannel' | 'byAlly' | 'byEntity'>('byChannel');
  const q = useLoad<AnaliticaResponse>(`/empresa/analitica${qs(applied)}`);

  function pick(p: '30' | '90' | '180') {
    setPreset(p);
    const r = { desde: daysAgo(Number(p)), hasta: hoyIso() };
    setDesde(r.desde);
    setHasta(r.hasta);
    setApplied(r);
  }

  const validRange = DATE.test(desde) && DATE.test(hasta) && desde <= hasta;

  return (
    <Page tab={tab} title={title} subtitle={q.data ? `${fecha(q.data.range.desde)} – ${fecha(q.data.range.hasta)} · hora de Bogotá` : undefined} refreshing={q.refreshing} onRefresh={q.refresh} busy={q.stale && !q.loading}>
      {header}
      <ChipRow>
        <Chip label="30 días" active={preset === '30'} onPress={() => pick('30')} />
        <Chip label="90 días" active={preset === '90'} onPress={() => pick('90')} />
        <Chip label="180 días" active={preset === '180'} onPress={() => pick('180')} />
        <Chip label="Personalizado" active={preset === 'custom'} onPress={() => setPreset('custom')} />
      </ChipRow>
      {preset === 'custom' ? (
        <Card style={{ marginBottom: space.md, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><DateField label="Desde" value={desde} onChange={setDesde} optional /></View>
            <View style={{ flex: 1 }}><DateField label="Hasta" value={hasta} onChange={setHasta} optional /></View>
          </View>
          {!validRange ? <T v="small" style={{ color: colors.danger }}>Elige un rango válido: la fecha inicial no puede ser posterior a la final.</T> : null}
          <Button small title="Aplicar rango" disabled={!validRange} onPress={() => setApplied({ desde, hasta })} />
        </Card>
      ) : null}
      <Loadable q={q}>
        {(d) => (
          <>
            <Card dark>
              <T v="eyebrow" style={{ color: '#9fd9cb' }}>Métrica norte</T>
              <T v="big" style={{ color: colors.white, fontSize: 38, lineHeight: 44, marginTop: 4 }}>{ratio(d.north.ratio)}</T>
              <T style={{ color: '#d6e6ea' }}>{`${d.north.numerator} de ${d.north.denominator} hogares activos tomaron una acción que mejora su crédito (últimos ${d.north.windowDays} días hasta ${fecha(d.north.windowEnd)}).`}</T>
              <View style={{ marginTop: space.md, gap: 4 }}>
                {d.north.byKind.map((k) => (
                  <View key={k.kind} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T v="small" style={{ color: '#d6e6ea', flex: 1 }}>{k.label}</T>
                    <T v="small" style={{ color: colors.white, fontFamily: fonts.bold }}>{`${k.households}`}</T>
                  </View>
                ))}
              </View>
            </Card>
            <Card style={{ marginTop: space.md, gap: 6 }}>
              <T v="eyebrow">Definición</T>
              <T v="small" style={{ color: colors.ink }}>{`Hogar: ${d.north.definition.household}`}</T>
              <T v="small" style={{ color: colors.ink }}>{`Activo: ${d.north.definition.active}`}</T>
              <T v="small" style={{ color: colors.ink }}>{`Acciones que cuentan: ${d.north.definition.actions}`}</T>
              <T v="small" style={{ color: colors.ink }}>{`Regla: ${d.north.definition.rule}`}</T>
            </Card>

            <Section title="Resultados del periodo">
              <StatGrid>
                <Stat label="Casos creados" value={String(d.kpis.created)} />
                <Stat label="Radicados" value={String(d.kpis.filed)} />
                <Stat label="Desembolsados" value={String(d.kpis.disbursed)} sub={pesosCortos(d.kpis.disbursedAmount)} />
                <Stat label="Desistidos" value={String(d.kpis.withdrawn)} tone={d.kpis.withdrawn ? 'wait' : undefined} />
                <Stat label="Creado → desembolso" value={ratio(d.kpis.createdToDisbursed)} />
                <Stat label="Radicado → desembolso" value={ratio(d.kpis.filedToDisbursed)} />
                <Stat label="Etapas dentro de SLA" value={ratio(d.kpis.slaRatio)} sub={`${d.kpis.slaWithin} de ${d.kpis.slaClosed}`} />
                <Stat label="SLA vencido hoy" value={String(d.kpis.overdueOpenToday)} tone={d.kpis.overdueOpenToday ? 'bad' : 'ok'} sub="casos abiertos" />
              </StatGrid>
            </Section>

            <Section title="Embudo acumulado">
              <Card>
                <Funnel items={d.funnel.map((f) => ({ label: f.label, value: f.reached }))} />
                <T v="small" style={{ marginTop: space.md }}>Casos creados en el rango que alcanzaron cada etapa.</T>
              </Card>
            </Section>

            <Section title="Conversión">
              <ChipRow>
                <Chip label="Por canal" active={conv === 'byChannel'} onPress={() => setConv('byChannel')} />
                <Chip label="Por aliado" active={conv === 'byAlly'} onPress={() => setConv('byAlly')} />
                <Chip label="Por entidad" active={conv === 'byEntity'} onPress={() => setConv('byEntity')} />
              </ChipRow>
              <Conversion rows={d.conversion[conv]} />
            </Section>

            <Section title="Tiempo por etapa vs SLA">
              {d.stageTimes.length === 0 ? <Empty>Sin etapas cerradas en el rango.</Empty> : null}
              {d.stageTimes.map((s) => (
                <Card key={s.stage}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T v="h3">{s.label}</T>
                    <T v="h3" style={{ color: s.withinSlaRatio !== null && s.withinSlaRatio < 0.9 ? colors.danger : colors.mintDeep }}>{ratio(s.withinSlaRatio, 0)}</T>
                  </View>
                  <Bars items={[{ label: `Mediana ${hours(s.medianHours)} · promedio ${hours(s.avgHours)}`, value: s.medianHours, display: s.slaHours ? `SLA ${hours(s.slaHours)}` : 'Sin SLA', color: s.slaHours && s.medianHours > s.slaHours ? colors.danger : colors.mint }]} max={s.slaHours ?? undefined} />
                  <T v="small">{`${s.closed} cerradas · ${s.overdueOpen} abiertas con SLA vencido`}</T>
                </Card>
              ))}
            </Section>

            <Section title="Desistimiento por causa">
              {d.withdrawalReasons.length === 0 ? <Empty>Sin desistimientos en el rango.</Empty> : (
                <Card>
                  <Bars items={d.withdrawalReasons.map((w) => ({ label: w.reason ?? 'Sin causa registrada', value: w.count }))} color={colors.amber} />
                </Card>
              )}
            </Section>

            <Section title="Calidad documental">
              <StatGrid>
                <Stat label="Revisados" value={String(d.documents.reviewed)} sub={`${d.documents.approved} aprobados · ${d.documents.rejected} rechazados`} />
                <Stat label="Rechazo" value={ratio(d.documents.rejectRatio)} tone={d.documents.rejectRatio !== null && d.documents.rejectRatio > 0.25 ? 'bad' : undefined} />
                <Stat label="Aprobados a la primera" value={ratio(d.documents.approvedFirstRatio)} />
              </StatGrid>
              {d.documents.topRejectedTypes.length ? (
                <Card>
                  <T v="eyebrow">Tipos más rechazados</T>
                  <View style={{ marginTop: 8 }}>
                    <Bars items={d.documents.topRejectedTypes.map((t) => ({ label: t.name, value: t.count }))} color={colors.danger} />
                  </View>
                </Card>
              ) : null}
            </Section>

            <Section title="Pagos reportados">
              <StatGrid>
                <Stat label="Reportes" value={String(d.payments.total)} />
                <Stat label="Conciliados" value={ratio(d.payments.reconciledRatio)} />
                <Stat label="Revisión promedio" value={d.payments.avgReviewHours === null ? '—' : hours(d.payments.avgReviewHours)} />
              </StatGrid>
              <Card>
                <Bars items={d.payments.byStatus.map((s) => ({ label: s.status.label, value: s.count }))} color={colors.blue} />
              </Card>
            </Section>

            <Section title="Solicitudes">
              <StatGrid>
                <Stat label="Resueltas" value={String(d.requests.resolved)} />
                <Stat label="Dentro de SLA" value={ratio(d.requests.withinSlaRatio)} sub={`${d.requests.withinSla} de ${d.requests.resolved}`} />
                <Stat label="Vencidas abiertas hoy" value={String(d.requests.overdueOpenToday)} tone={d.requests.overdueOpenToday ? 'bad' : 'ok'} />
              </StatGrid>
              {d.requests.resolvedByKind.length ? (
                <Card>
                  {d.requests.resolvedByKind.map((k) => (
                    <Line key={k.kind.code} label={k.kind.label} value={String(k.count)} />
                  ))}
                </Card>
              ) : null}
              {d.requests.note ? <Notice tone="info">{d.requests.note}</Notice> : null}
            </Section>
          </>
        )}
      </Loadable>
    </Page>
  );
}
