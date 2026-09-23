import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { rateText } from '@/lib/cliente/format';
import type { GestionesResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { fecha, pesos } from '@/services/format';
import { Lines } from '@/ui/cliente/components';
import { backTo, R } from '@/ui/cliente/nav';
import { Button, Card, Checkbox, Empty, ErrorState, KeyValue, Loading, Notice, ResultBanner, Screen, Section, T } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

export default function AceptarOferta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<GestionesResponse>('/cliente/gestiones');
  const [confirm, setConfirm] = useState(false);
  const action = useAction();

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const c = data?.cases.find((x) => x.offers.some((o) => o.id === id));
  const o = c?.offers.find((x) => x.id === id);
  if (!c || !o) return <Screen><Empty>No encontramos esta oferta.</Empty></Screen>;

  async function accept() {
    const res = await action.run(`/cliente/ofertas/${id}/aceptar`, { confirm: true });
    if (res.ok) reload();
  }

  const accepted = Boolean(o.acceptedAt) || Boolean(action.result?.ok);

  return (
    <Screen>
      <T v="eyebrow">Caso {c.code} · {c.productLabel}</T>
      <T v="title" style={{ marginTop: 4 }}>{o.entityName}</T>
      <T v="muted" style={{ marginTop: 6 }}>Revisa con calma las condiciones, los resultados estimados y los supuestos antes de aceptar. Aceptar no es firmar el crédito.</T>

      <Section title="Condiciones">
        <Card>
          <KeyValue
            items={[
              ['Tasa', `${rateText(o.rateEa)} EA${o.system === 'UVR' ? ' + UVR' : ''}`],
              ['Sistema', o.system === 'UVR' ? 'UVR (se ajusta con la inflación)' : 'Tasa fija en pesos'],
              ['Monto', pesos(o.amount)],
              ['Plazo', `${o.termMonths} meses`],
              ['Seguros al mes', pesos(o.monthlyInsurance)],
              ['Costos iniciales', pesos(o.upfrontCosts)],
              ['Vigente hasta', o.validUntil ? fecha(o.validUntil) : 'Sin fecha'],
            ]}
          />
          {o.conditions ? (
            <View style={{ marginTop: 12 }}>
              <T v="eyebrow">Condiciones adicionales</T>
              <T style={{ marginTop: 4 }} selectable>{o.conditions}</T>
            </View>
          ) : null}
        </Card>
      </Section>

      {o.summary.length ? (
        <Section title="Resultados estimados">
          <Card><Lines lines={o.summary} /></Card>
        </Section>
      ) : null}

      <Section title="Supuestos">
        <Card>
          <T v="small" style={{ color: colors.ink }}>Fuente de la oferta: {o.source}. Calculada con el motor OpenV {o.engineVersion} el {fecha(o.createdAt)}.</T>
          <T v="small" style={{ marginTop: 6, color: colors.ink }}>Las cifras son estimaciones con las condiciones indicadas. La aprobación y las condiciones definitivas las fija la entidad por escrito.</T>
          {o.system === 'UVR' ? <T v="small" style={{ marginTop: 6, color: colors.ink }}>En UVR la cuota y el saldo en pesos cambian con la inflación.</T> : null}
        </Card>
      </Section>

      <View style={{ marginTop: 20, gap: 12 }}>
        {o.expired && !accepted ? <Notice tone="bad">La oferta venció. Pide a tu asesor una actualizada.</Notice> : null}
        {accepted ? (
          <Notice tone="info">{o.acceptedAt ? `Aceptaste esta oferta el ${fecha(o.acceptedAt)}.` : 'Registramos tu aceptación.'} Tu asesor te indicará los siguientes pasos para la firma.</Notice>
        ) : o.canAccept ? (
          <>
            <Checkbox checked={confirm} onChange={setConfirm}>
              <T style={{ fontSize: 14, fontFamily: fonts.medium }}>Leí las condiciones, supuestos y advertencias, y acepto continuar con esta oferta. Entiendo que no es la firma del crédito.</T>
            </Checkbox>
            <Button title="Aceptar oferta" onPress={accept} loading={action.pending} disabled={!confirm} />
          </>
        ) : !o.expired ? (
          <Notice tone="info">Esta oferta ya no se puede aceptar desde aquí. Si tienes dudas, habla con tu asesor.</Notice>
        ) : null}
        <ResultBanner result={action.result} />
        {action.result?.ok ? <Button variant="secondary" title="Volver al caso" onPress={() => backTo(R.caso(c.id))} /> : null}
      </View>
    </Screen>
  );
}
