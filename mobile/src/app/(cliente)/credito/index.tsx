import { useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { isoMonthText, monthsText, rateText } from '@/lib/cliente/format';
import type { CreditoResponse } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { fecha, pesos, pesosCortos } from '@/services/format';
import { Bullets, PESO_COLORS, PesoMap, Timeline, toneOf } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { Button, Card, Confidence, Empty, ErrorState, Grid, Kpi, Loading, Notice, Pill, Row, Screen, Section, Segmented, T } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function MiCredito() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const id = picked ?? params.id;
  const { data, error, loading, refreshing, refresh, reload } = useApi<CreditoResponse>(`/cliente/credito${id ? `?id=${id}` : ''}`);
  const [showAssumptions, setShowAssumptions] = useState(false);

  if (loading && !data) return <Screen title="Mi crédito"><Loading /></Screen>;
  if (error && !data) return <Screen title="Mi crédito"><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;

  const sel = data.selected;
  if (!sel) {
    return (
      <Screen title="Mi crédito" subtitle="¿Qué debo, cuánto cuesta y cómo se comporta?" refreshing={refreshing} onRefresh={refresh}>
        <Empty>Aún no registras tu crédito de vivienda. Con la entidad, la tasa, el plazo, el saldo y el día de pago (están en tu extracto) calculamos tu cuota, tus intereses y tu fecha de terminación.</Empty>
        <Button title="Registrar mi crédito" onPress={() => go(R.creditoEditar())} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  const { loan, schedule, nextPayment } = sel;
  const next = nextPayment.row;
  const remaining = loan.termMonths - loan.paidInstallments;

  return (
    <Screen title="Mi crédito" subtitle="¿Qué debo, cuánto cuesta y cómo se comporta?" refreshing={refreshing} onRefresh={refresh}>
      {data.loans.length > 1 ? (
        <View style={{ marginBottom: 12 }}>
          <Segmented value={loan.id} options={data.loans.map((l) => ({ value: l.id, label: l.alias }))} onChange={setPicked} />
        </View>
      ) : null}

      <Card>
        <T v="eyebrow">{loan.alias}{loan.entityName ? ` · ${loan.entityName}` : ''}</T>
        <T v="small" style={{ marginTop: 4 }}>{loan.system === 'UVR' ? 'UVR + tasa real' : 'Tasa fija en pesos'}{loan.propertyAlias ? ` · respalda: ${loan.propertyAlias}` : ''}</T>
        <Confidence level={loan.confidence} source={loan.source} asOf={`saldo al ${fecha(loan.balanceAsOf)}`} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button small title="Reportar pago" onPress={() => go(R.reportarPago(loan.id))} />
          <Button small variant="secondary" title="Editar datos" onPress={() => go(R.creditoEditar(loan.id))} />
        </View>
      </Card>

      <View style={{ marginTop: 12 }}>
        <Grid>
          <Kpi label="Saldo de capital" value={pesosCortos(loan.balance)} sub={pesos(loan.balance)} />
          <Kpi label="Tasa" value={`${rateText(loan.rateEa)} EA`} sub={sel.monthlyInterestNow !== null ? `Este mes ≈ ${pesos(sel.monthlyInterestNow)} en intereses` : undefined} />
          <Kpi label="Cuota estimada" value={next ? pesos(next.payment) : '—'} sub={next ? `Próxima: ${fecha(nextPayment.dueDate)} (día ${loan.paymentDay})` : 'Completa los datos para estimarla'} />
          <Kpi label="Tiempo restante" value={monthsText(remaining)} sub={schedule ? `Terminarías en ${isoMonthText(schedule.payoffDate)} · ${loan.paidInstallments} de ${loan.termMonths} cuotas` : `${loan.paidInstallments} de ${loan.termMonths} cuotas pagadas`} />
        </Grid>
      </View>

      <View style={{ gap: 8, marginTop: 12 }}>
        {sel.notices.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
        {loan.system === 'UVR' ? (
          <T v="small">
            Parámetros UVR: {data.uvrParams.uvr ? `UVR ${data.uvrParams.uvr.value} (${data.uvrParams.uvr.source}, ${fecha(data.uvrParams.uvr.asOf)})` : 'UVR no cargada'} ·{' '}
            {data.uvrParams.inflation ? `inflación proyectada ${rateText(data.uvrParams.inflation.value)} (${data.uvrParams.inflation.source}, ${fecha(data.uvrParams.inflation.asOf)})` : 'inflación proyectada no cargada'}.
          </T>
        ) : null}
      </View>

      <Section title="Mapa de cada peso">
        <Card>
          <T v="h3" style={{ marginBottom: 10 }}>Tu próxima cuota</T>
          {next ? (
            <PesoMap
              parts={[
                { label: 'Capital (lo que ya es tuyo)', value: next.principal, color: PESO_COLORS.capital },
                { label: 'Intereses (costo del dinero)', value: next.interest, color: PESO_COLORS.interest },
                { label: 'Seguros', value: next.insurance, color: PESO_COLORS.insurance },
              ]}
              caption={`Cuota del ${fecha(next.date)} estimada con el motor OpenV. De cada $100 que pagas, $${Math.round((next.principal / next.payment) * 100)} bajan tu deuda.`}
            />
          ) : (
            <T v="small">Completa los datos del crédito para desglosar la cuota.</T>
          )}
        </Card>
        <Card>
          <T v="h3" style={{ marginBottom: 10 }}>Lo que te falta pagar</T>
          {schedule ? (
            <PesoMap
              parts={[
                { label: 'Capital', value: schedule.totals.principal, color: PESO_COLORS.capital },
                { label: 'Intereses', value: schedule.totals.interest, color: PESO_COLORS.interest },
                { label: 'Seguros', value: schedule.totals.insurance, color: PESO_COLORS.insurance },
              ]}
              caption={`Total restante estimado: ${pesos(schedule.totals.paid)} en ${schedule.months} cuotas, sin abonos.`}
            />
          ) : (
            <T v="small">Sin cronograma calculado.</T>
          )}
        </Card>
      </Section>

      <Section title="Intereses evitados">
        <Card>
          <T v="eyebrow">Con tus abonos validados</T>
          <T v="big" style={{ marginTop: 6 }}>{sel.interestAvoided.prepayments ? pesos(sel.interestAvoided.amount) : '—'}</T>
          <T v="small">
            {sel.interestAvoided.prepayments
              ? `${sel.interestAvoided.prepayments} abono(s) validado(s) por ${pesos(sel.interestAvoided.prepaidTotal)}.`
              : 'Aún no tienes abonos validados. Solo cuentan los abonos que operación verificó con soporte.'}
          </T>
          {sel.interestAvoided.prepayments ? <Confidence level="ESTIMATED" source="Motor OpenV: intereses restantes con y sin cada abono, con las condiciones actuales" /> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button small variant="secondary" title="Simular un abono" onPress={() => go(R.simular('PREPAYMENT'))} />
            <Button small variant="secondary" title="Ruta Libre Antes" onPress={() => go(R.simular('FREE_EARLY'))} />
          </View>
        </Card>
      </Section>

      <Section title="Línea de tiempo">
        <Card>
          {sel.timeline.length ? (
            <Timeline items={sel.timeline.slice(0, 12).map((t, i) => ({ key: `${t.date}-${i}`, title: t.title, meta: fecha(t.date), detail: t.detail }))} />
          ) : (
            <T v="small">Sin eventos.</T>
          )}
        </Card>
      </Section>

      <Section title="Tabla de amortización">
        {schedule ? (
          <Card>
            <T>{schedule.months} cuotas restantes estimadas; la última el {fecha(schedule.payoffDate)}.</T>
            <Button variant="secondary" title="Ver tabla cuota a cuota" onPress={() => go(R.amortizacion(loan.id))} style={{ marginTop: 12 }} />
            <Button small variant="secondary" title={showAssumptions ? 'Ocultar supuestos' : `Supuestos del cálculo (motor ${schedule.engineVersion})`} onPress={() => setShowAssumptions(!showAssumptions)} style={{ marginTop: 8 }} />
            {showAssumptions ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <Bullets items={schedule.assumptions} />
                {schedule.warnings.length ? <Bullets items={schedule.warnings} color={colors.amber} /> : null}
              </View>
            ) : null}
          </Card>
        ) : (
          <Empty>No podemos calcular la tabla con los datos actuales. Revisa los datos del crédito.</Empty>
        )}
      </Section>

      <Section title="Pagos reportados" right={<Button small variant="secondary" title="Ver todos" onPress={() => go(R.gestiones('pagos'))} />}>
        {sel.payments.length ? (
          sel.payments.slice(0, 6).map((p) => (
            <Row
              key={p.id}
              title={`${p.kind === 'PREPAYMENT' ? 'Abono a capital' : 'Cuota'} · ${pesos(p.amount)}`}
              subtitle={`Pagado el ${fecha(p.paidOn)} · ${p.channel}${p.rejectReason ? ` · Motivo: ${p.rejectReason}` : ''}`}
              right={<Pill tone={toneOf(p.status.tone)}>{p.status.label}</Pill>}
            />
          ))
        ) : (
          <Empty>No has reportado pagos de este crédito.</Empty>
        )}
      </Section>

      <Button variant="secondary" title="Registrar otro crédito" icon={<Plus size={18} color={colors.ink} />} onPress={() => go(R.creditoEditar())} style={{ marginTop: 24 }} />
    </Screen>
  );
}
