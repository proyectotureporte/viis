import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { PropertyView, ViviendaResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { decimal, fecha, fechaHora, pct, pesos, pesosCortos } from '@/services/format';
import { toneOf } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { useOpenDocument } from '@/ui/cliente/useOpen';
import { Button, Card, Confidence, Empty, ErrorState, Field, KeyValue, Loading, Pill, ResultBanner, Row, Screen, Section, T } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function Vivienda() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<ViviendaResponse>('/cliente/vivienda');
  const docs = useOpenDocument();

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <T v="muted">Tu inmueble, su valor con fuente y fecha, y lo que debes sobre él. Un valor declarado no es un avalúo.</T>
      {data.properties.length === 0 ? (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Empty>Aún no registras tu vivienda. Con su ficha y un valor estimado calculamos tu patrimonio.</Empty>
          <Button title="Registrar inmueble" onPress={() => go(R.inmueble())} />
        </View>
      ) : (
        data.properties.map((p) => <PropertyCard key={p.id} p={p} onChanged={reload} />)
      )}

      {data.properties.length ? <Button variant="secondary" title="Registrar otro inmueble" icon={<Plus size={18} color={colors.ink} />} onPress={() => go(R.inmueble())} style={{ marginTop: 16 }} /> : null}

      <Section title="Solicitudes de avalúo">
        {data.appraisalRequests.length ? (
          data.appraisalRequests.map((a) => <Row key={a.id} title={a.code} subtitle={`Creada ${fechaHora(a.createdAt)}`} right={<Pill tone={toneOf(a.status.tone)}>{a.status.label}</Pill>} onPress={() => go(R.solicitud(a.id))} />)
        ) : (
          <T v="small">No has solicitado avalúos.</T>
        )}
      </Section>

      <Section title="Documentos del inmueble">
        {docs.error ? <ResultBanner result={{ ok: false, message: docs.error }} /> : null}
        {data.homeDocuments.length ? (
          data.homeDocuments.map((d) => (
            <Row
              key={d.id}
              title={`${d.typeName} · v${d.version}`}
              subtitle={`${d.fileName} · ${fecha(d.createdAt)}${d.viewable ? '' : ' · en verificación antivirus'}`}
              right={<Pill tone={toneOf(d.status.tone)}>{docs.pendingId === d.id ? 'Abriendo…' : d.status.label}</Pill>}
              onPress={d.viewable ? () => docs.open(d.id, `${d.typeName} v${d.version}`) : undefined}
            />
          ))
        ) : (
          <T v="small">Certificado de tradición y libertad, avalúo o póliza: súbelos desde Documentos.</T>
        )}
        <Button small variant="secondary" title="Ir a Documentos" onPress={() => go(R.documentos)} />
      </Section>
    </Screen>
  );
}

function PropertyCard({ p, onChanged }: { p: PropertyView; onChanged: () => void }) {
  const v = p.latestValuation;
  const [detail, setDetail] = useState('');
  const [askAppraisal, setAskAppraisal] = useState(false);
  const action = useAction();

  async function requestAppraisal() {
    const res = await action.run('/cliente/vivienda/avaluo', { propertyId: p.id, ...(detail.trim() ? { detail: detail.trim() } : {}) });
    if (res.ok) {
      setAskAppraisal(false);
      setDetail('');
      onChanged();
    }
  }

  return (
    <View style={{ marginTop: 16, gap: 12 }}>
      <Card>
        <T v="eyebrow">{p.kindLabel}{p.isVis ? ' · VIS' : ''}</T>
        <T v="h2" style={{ marginTop: 4 }}>{p.alias}</T>
        <View style={{ marginTop: 10 }}>
          <KeyValue
            items={[
              ['Dirección', p.address ?? '—'],
              ['Ciudad', p.city ?? '—'],
              ['Estrato', p.stratum ? String(p.stratum) : '—'],
              ['Área', p.areaM2 ? `${decimal(p.areaM2, p.areaM2 % 1 ? 1 : 0)} m²` : '—'],
            ]}
          />
        </View>
        <Button small variant="secondary" title="Editar ficha" onPress={() => go(R.inmueble(p.id))} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
      </Card>

      <Card>
        <T v="eyebrow">Valor estimado</T>
        {v ? (
          <>
            <T v="big" style={{ marginTop: 6 }}>{pesosCortos(v.value)}</T>
            <T v="small">{pesos(v.value)}{v.low !== null && v.high !== null ? ` · rango ${pesosCortos(v.low)} a ${pesosCortos(v.high)}` : ''}</T>
            <Confidence level={v.confidence} source={v.source} asOf={fecha(v.asOf)} />
            {v.methodology ? <T v="small" style={{ marginTop: 4 }}>{v.methodology}</T> : null}
            <View style={{ marginTop: 10 }}>
              <KeyValue
                items={[
                  ['Deuda sobre el inmueble', pesos(p.debt)],
                  ['Deuda / valor', p.ltv !== null ? pct(p.ltv, 1) : '—'],
                  ['Patrimonio', pesos(v.value - p.debt)],
                ]}
              />
            </View>
            <T v="small" style={{ marginTop: 8 }}>Estimación, no avalúo oficial.</T>
          </>
        ) : (
          <T style={{ marginTop: 6 }}>Sin valor registrado. Declara un valor con fecha y en qué te basas para calcular tu patrimonio.</T>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Button small title={v ? 'Actualizar valor' : 'Registrar valor'} onPress={() => go(R.valor(p.id))} />
          <Button small variant="secondary" title="Solicitar avalúo" onPress={() => setAskAppraisal(!askAppraisal)} />
        </View>
        {askAppraisal ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            <T v="small">Un perito inscrito en el Registro Abierto de Avaluadores hace el avalúo comercial formal. Te contactamos para coordinar la visita y el costo antes de hacer cualquier cobro.</T>
            <Field label="Detalle (opcional)" value={detail} onChangeText={setDetail} multiline maxLength={1000} placeholder="Por ejemplo: lo necesito para una compra de cartera." />
            <Button title="Enviar solicitud de avalúo" onPress={requestAppraisal} loading={action.pending} />
          </View>
        ) : null}
        <View style={{ marginTop: 10 }}><ResultBanner result={action.result} /></View>
      </Card>

      {p.valuations.length ? (
        <Card>
          <T v="eyebrow" style={{ marginBottom: 8 }}>Historial de valoraciones</T>
          <View style={{ gap: 10 }}>
            {[...p.series].reverse().map((sv, i) => {
              const val = [...p.valuations].reverse()[i];
              return (
                <View key={`${sv.date}-${i}`} style={{ borderTopWidth: i ? 1 : 0, borderColor: colors.mist, paddingTop: i ? 10 : 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T v="h3">{pesos(sv.value)}</T>
                    <T v="small">{fecha(sv.date)}</T>
                  </View>
                  <T v="small">Patrimonio en esa fecha: {pesos(sv.net)}</T>
                  {val ? <Confidence level={val.confidence} source={val.source} /> : null}
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}
    </View>
  );
}
