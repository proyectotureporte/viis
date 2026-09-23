import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { rateText } from '@/lib/cliente/format';
import type { GestionesResponse, OfferView } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { fecha, fechaHora, pesos } from '@/services/format';
import { Bullets, Lines, StageSteps, Timeline } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { Button, Card, Empty, ErrorState, KeyValue, Loading, Pill, Screen, Section, T } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

export default function Caso() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, refresh, reload } = useApi<GestionesResponse>('/cliente/gestiones');
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const c = data?.cases.find((x) => x.id === id);
  if (!c) return <Screen><Empty>No encontramos este caso.</Empty></Screen>;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <T v="h2" style={{ flex: 1 }}>{c.code} · {c.productLabel}</T>
        <Pill tone={c.stage === 'WITHDRAWN' ? 'gray' : 'info'}>{c.stageLabel}</Pill>
      </View>
      <View style={{ marginTop: 10 }}><StageSteps stage={c.stage} /></View>
      <Card style={{ marginTop: 12 }}>
        <T>{c.stageText}</T>
        <View style={{ marginTop: 12 }}>
          <KeyValue
            items={[
              ['Responsable', c.responsible],
              ...(c.entityName ? ([['Entidad', c.entityName]] as [string, string][]) : []),
              ['Siguiente paso', c.nextAction ?? '—'],
              ...(c.sla ? ([['Tiempo de respuesta', c.sla.overdue ? 'Nuestro plazo venció; tu caso está priorizado.' : `Faltan ${c.sla.text}`]] as [string, string][]) : []),
              ...(c.withdrawReason ? ([['Motivo de cierre', c.withdrawReason]] as [string, string][]) : []),
              ...(c.missingDocuments.length ? [] : ([['Qué falta de ti', 'Nada por ahora']] as [string, string][])),
            ]}
          />
        </View>
        {c.missingDocuments.length ? (
          <View style={{ marginTop: 12 }}>
            <T v="small" style={{ fontFamily: fonts.semibold, color: colors.amber, marginBottom: 6 }}>Qué falta de ti</T>
            <Bullets items={c.missingDocuments} color={colors.ink} />
            <Button small title="Subir documentos" onPress={() => go(R.documentos)} style={{ marginTop: 12 }} />
          </View>
        ) : null}
        <T v="small" style={{ marginTop: 10 }}>Actualizado {fecha(c.stageAt)} · desde {fecha(c.createdAt)}</T>
      </Card>

      {c.offers.length ? (
        <Section title="Ofertas">
          {c.offers.map((o) => <OfferCard key={o.id} o={o} />)}
        </Section>
      ) : null}

      <Section title="Línea de tiempo">
        <Card>
          {c.stages.length ? (
            <Timeline items={[...c.stages].reverse().map((st) => ({ key: st.id, title: `${st.fromLabel ? `${st.fromLabel} → ` : ''}${st.toLabel}`, meta: fechaHora(st.createdAt) }))} />
          ) : (
            <T v="small">Sin cambios de etapa todavía.</T>
          )}
        </Card>
      </Section>

      <Section title="Novedades del equipo">
        {c.interactions.length ? (
          <Card>
            <Timeline items={c.interactions.map((i) => ({ key: i.id, title: i.summary, meta: `${fechaHora(i.createdAt)} · ${i.channel}` }))} />
          </Card>
        ) : (
          <Empty>Sin novedades compartidas todavía.</Empty>
        )}
      </Section>
    </Screen>
  );
}

function OfferCard({ o }: { o: OfferView }) {
  return (
    <Card style={{ backgroundColor: colors.mist }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <T v="h3" style={{ flex: 1 }}>{o.entityName}</T>
        {o.acceptedAt ? <Pill tone="ok">Aceptada {fecha(o.acceptedAt)}</Pill> : o.expired ? <Pill tone="bad">Vencida</Pill> : <Pill tone="wait">Por decidir</Pill>}
      </View>
      <View style={{ marginTop: 10 }}>
        <KeyValue
          items={[
            ['Tasa', `${rateText(o.rateEa)} EA${o.system === 'UVR' ? ' + UVR' : ''}`],
            ['Monto', pesos(o.amount)],
            ['Plazo', `${o.termMonths} meses`],
            ['Seguros/mes', pesos(o.monthlyInsurance)],
            ['Costos iniciales', pesos(o.upfrontCosts)],
            ['Vigencia', o.validUntil ? fecha(o.validUntil) : 'Sin fecha'],
          ]}
        />
      </View>
      {o.summary.length ? <View style={{ marginTop: 10 }}><Lines lines={o.summary.slice(0, 4)} /></View> : null}
      <T v="small" style={{ marginTop: 10 }}>Fuente: {o.source} · motor {o.engineVersion} · presentada {fecha(o.createdAt)}. La aprobación y las condiciones definitivas las fija la entidad.</T>
      {o.canAccept ? <Button title="Revisar y aceptar" onPress={() => go(R.oferta(o.id))} style={{ marginTop: 12 }} /> : null}
    </Card>
  );
}
