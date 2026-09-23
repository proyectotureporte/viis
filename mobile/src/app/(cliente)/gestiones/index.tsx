import { router, useLocalSearchParams } from 'expo-router';
import { HeartHandshake, Plus, Receipt } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { GestionesResponse } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { fecha, fechaHora, pesos } from '@/services/format';
import { StageSteps, toneOf } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { Button, Card, Empty, ErrorState, Loading, Notice, Pill, Row, Screen, Segmented, T } from '@/ui/kit';
import { colors } from '@/ui/theme';

type Tab = 'pagos' | 'solicitudes' | 'casos';
const TABS = [
  { value: 'pagos', label: 'Pagos' },
  { value: 'solicitudes', label: 'Solicitudes' },
  { value: 'casos', label: 'Mis casos' },
];

export default function Gestiones() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: Tab = params.tab === 'solicitudes' || params.tab === 'casos' ? params.tab : 'pagos';
  const { data, error, loading, refreshing, refresh, reload } = useApi<GestionesResponse>('/cliente/gestiones');

  return (
    <Screen title="Gestiones" subtitle="Pagos, solicitudes y casos en curso: qué pasa, quién responde y cuándo." refreshing={refreshing} onRefresh={refresh}>
      <Segmented value={tab} options={TABS} onChange={(v) => router.setParams({ tab: v })} />
      <View style={{ marginTop: 16, gap: 12 }}>
        {loading && !data ? <Loading /> : error && !data ? <ErrorState message={error} onRetry={reload} /> : data ? (
          tab === 'pagos' ? <Pagos data={data} /> : tab === 'solicitudes' ? <Solicitudes data={data} /> : <Casos data={data} />
        ) : null}
      </View>
    </Screen>
  );
}

function Pagos({ data }: { data: GestionesResponse }) {
  return (
    <>
      {data.loans.length ? (
        <Button title="Reportar un pago" icon={<Receipt size={18} color={colors.navy} />} onPress={() => go(R.reportarPago())} />
      ) : (
        <Card>
          <T>Para reportar pagos primero registra tu crédito.</T>
          <Button small title="Registrar crédito" onPress={() => go(R.creditoEditar())} style={{ marginTop: 10 }} />
        </Card>
      )}
      <Notice>{data.paymentWarning}</Notice>
      <T v="small">Estados: reportado → en revisión → validado o rechazado (siempre con motivo) → conciliado. Tu crédito solo se actualiza con pagos validados.</T>
      {data.payments.length === 0 ? (
        <Empty>Aún no has reportado pagos.</Empty>
      ) : (
        data.payments.map((p) => (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <T v="h3" style={{ flex: 1 }}>{p.kind === 'PREPAYMENT' ? `Abono (${p.applyMode === 'PAYMENT' ? 'reduce cuota' : 'reduce plazo'})` : 'Cuota'} · {pesos(p.amount)}</T>
              <Pill tone={toneOf(p.status.tone)}>{p.status.label}</Pill>
            </View>
            <T v="small" style={{ marginTop: 4 }}>{p.loanAlias} · pagado {fecha(p.paidOn)} · {p.channel}{p.reference ? ` · ref. ${p.reference}` : ''}</T>
            {p.status.code === 'REJECTED' ? <T v="small" style={{ color: colors.danger, marginTop: 4 }}>Motivo: {p.rejectReason ?? 'sin motivo registrado'}</T> : null}
            <T v="small" style={{ marginTop: 4 }}>Reportado {fechaHora(p.createdAt)}{p.reviewedAt ? ` · revisado ${fechaHora(p.reviewedAt)}` : ''}</T>
          </Card>
        ))
      )}
    </>
  );
}

function Solicitudes({ data }: { data: GestionesResponse }) {
  const [now] = useState(() => Date.now());
  return (
    <>
      <Button title="Nueva solicitud" icon={<Plus size={18} color={colors.navy} />} onPress={() => go(R.nuevaSolicitud())} />
      <Card dark onPress={() => go(R.nuevaSolicitud('HARDSHIP'))}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <HeartHandshake size={26} color={colors.mint} />
          <View style={{ flex: 1 }}>
            <T v="h3" style={{ color: colors.white }}>Modo Tranquilidad</T>
            <T v="small" style={{ color: '#c4d8dd' }}>¿Tienes dificultades para pagar? Mira cómo queda tu presupuesto y una persona te acompaña.</T>
          </View>
        </View>
      </Card>
      {data.requests.length === 0 ? (
        <Empty>No tienes solicitudes. Crea una cuando la necesites: cada una tiene código y tiempo de respuesta.</Empty>
      ) : (
        data.requests.map((r) => (
          <Row
            key={r.id}
            dot={r.closed ? 'gray' : new Date(r.slaDueAt).getTime() < now ? 'bad' : 'ok'}
            title={`${r.code} · ${r.subject}`}
            subtitle={`${r.kindLabel} · creada ${fecha(r.createdAt)}${r.closed ? '' : ` · respuesta antes de ${fechaHora(r.slaDueAt)}`}`}
            right={<Pill tone={toneOf(r.status.tone)}>{r.status.label}</Pill>}
            onPress={() => go(R.solicitud(r.id))}
          />
        ))
      )}
    </>
  );
}

function Casos({ data }: { data: GestionesResponse }) {
  if (!data.cases.length) return <Empty>No tienes casos abiertos. Un caso se crea cuando inicias un crédito, una compra de cartera u otro trámite con un asesor o aliado.</Empty>;
  return (
    <>
      {data.cases.map((c) => {
        const pending = c.offers.filter((o) => o.canAccept).length;
        return (
          <Card key={c.id} onPress={() => go(R.caso(c.id))}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <T v="h3" style={{ flex: 1 }}>{c.code} · {c.productLabel}</T>
              <Pill tone={c.stage === 'WITHDRAWN' ? 'gray' : 'info'}>{c.stageLabel}</Pill>
            </View>
            <View style={{ marginTop: 8 }}><StageSteps stage={c.stage} /></View>
            <T style={{ marginTop: 8 }}>{c.stageText}</T>
            <T v="small" style={{ marginTop: 6 }}>Siguiente paso: {c.nextAction ?? '—'}</T>
            {c.missingDocuments.length ? <T v="small" style={{ color: colors.amber, marginTop: 4 }}>Falta de ti: {c.missingDocuments.join(', ')}</T> : null}
            {pending ? <View style={{ marginTop: 8 }}><Pill tone="wait">{pending === 1 ? '1 oferta por decidir' : `${pending} ofertas por decidir`}</Pill></View> : null}
          </Card>
        );
      })}
    </>
  );
}
