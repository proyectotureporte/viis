import { Bell, CircleCheck, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClienteInicioResponse, NextActionItem, NotificacionesResponse } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { fecha, pct, pesos, pesosCortos } from '@/services/format';
import { Bullets, Dot, PESO_COLORS, PesoMap, StageSteps, toneOf } from '@/ui/cliente/components';
import { go, linkHref, R } from '@/ui/cliente/nav';
import { Button, Card, Confidence, Empty, ErrorState, KeyValue, Loading, Notice, Pill, Progress, Screen, Section, T } from '@/ui/kit';
import { colors, fonts, radius } from '@/ui/theme';

export default function Inicio() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<ClienteInicioResponse>('/cliente/inicio');
  const notif = useApi<NotificacionesResponse>('/notificaciones');
  const unread = notif.data?.unread ?? 0;
  const onRefresh = () => {
    refresh();
    notif.refresh();
  };

  const bell = (
    <Pressable onPress={() => go(R.notificaciones)} style={s.bell} accessibilityRole="button" accessibilityLabel={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'} hitSlop={8}>
      <Bell size={22} color={colors.ink} />
      {unread > 0 ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  if (loading && !data) return <Screen title="Inicio" right={bell}><Loading /></Screen>;
  if (error && !data) return <Screen title="Inicio" right={bell}><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;

  const greeting = `Hola${data.firstName ? `, ${data.firstName}` : ''}`;
  if (!data.hasPerson) {
    return (
      <Screen title={greeting} right={bell} refreshing={refreshing} onRefresh={onRefresh}>
        {data.notices.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
      </Screen>
    );
  }

  const ob = data.onboarding;
  const needsOnboarding = !ob.household || !ob.property || !ob.loan;
  const empty = !data.patrimonio && !data.avance;

  return (
    <Screen
      title={greeting}
      subtitle={empty ? 'Empecemos por lo esencial: en cinco pasos verás tu patrimonio, tu cuota y tu próxima mejor acción.' : 'Así está hoy tu vivienda y esto es lo que más te conviene revisar.'}
      right={bell}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {!ob.done ? <Onboarding data={data} prominent={needsOnboarding} /> : null}

      {!empty ? (
        <View style={{ gap: 12, marginTop: ob.done ? 0 : 12 }}>
          <Patrimonio data={data} />
          <Avance data={data} />
          <MejorAccion data={data} />
          <ProximoPago data={data} />
          <Radar data={data} />
          {data.notices.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
        </View>
      ) : null}

      <Section title="Estado de mis casos" right={data.casos.length ? <Pressable onPress={() => go(R.gestiones('casos'))} accessibilityRole="link"><T style={{ color: colors.blue }}>Ver detalle</T></Pressable> : undefined}>
        {data.casos.length === 0 ? (
          <Empty>No tienes casos en trámite. Si quieres un crédito nuevo, una compra de cartera o revisar tu tasa, habla con un asesor desde Más → Ayuda.</Empty>
        ) : (
          data.casos.map((c) => (
            <Card key={c.id} onPress={() => go(R.caso(c.id))}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <T v="h3" style={{ flex: 1 }}>{c.code} · {c.productLabel}</T>
                <Pill tone={c.stage === 'APPROVED' ? 'ok' : 'info'}>{c.stageLabel}</Pill>
              </View>
              <View style={{ marginTop: 8 }}><StageSteps stage={c.stage} /></View>
              <T style={{ marginTop: 8 }}>{c.stageText}</T>
              <View style={{ marginTop: 10 }}>
                <KeyValue
                  items={[
                    ['Responsable', c.responsible],
                    ...(c.entityName ? ([['Entidad', c.entityName]] as [string, string][]) : []),
                    ['Siguiente paso', c.nextAction ?? 'Te avisaremos del siguiente paso.'],
                    ['Tiempo de respuesta', c.sla ? (c.sla.overdue ? 'Nuestro plazo venció; tu caso está priorizado.' : `Faltan ${c.sla.text}`) : '—'],
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
              <T v="small" style={{ marginTop: 8 }}>Actualizado {fecha(c.stageAt)} · desde {fecha(c.createdAt)}</T>
            </Card>
          ))
        )}
      </Section>
    </Screen>
  );
}

function Onboarding({ data, prominent }: { data: ClienteInicioResponse; prominent: boolean }) {
  const [open, setOpen] = useState(prominent);
  const ob = data.onboarding;
  const steps = [
    { done: ob.goals, title: '1. Tus objetivos', detail: 'Cuéntanos qué quieres lograr con tu vivienda: terminar antes, bajar la cuota, comprar…', cta: 'Definir objetivos', href: R.hogar },
    { done: ob.household, title: '2. Tu hogar e ingresos', detail: 'Ingresos, gastos y ahorro del hogar: sin ellos no recomendamos abonos ni cambios.', cta: 'Completar', href: R.hogar },
    { done: ob.property, title: '3. Tu inmueble', detail: 'Registra tu vivienda: ciudad, tipo y área.', cta: 'Registrar inmueble', href: R.inmueble() },
    { done: ob.valuation, title: '4. Valor de tu vivienda', detail: 'Un valor declarado o un avalúo, con fecha y fuente, para calcular tu patrimonio.', cta: ob.property ? 'Registrar valor' : 'Primero registra el inmueble', href: ob.property ? R.vivienda : R.inmueble() },
    { done: ob.loan, title: '5. Tu crédito', detail: 'Entidad, tasa, plazo, saldo y día de pago, tal como aparecen en tu extracto.', cta: 'Registrar crédito', href: R.creditoEditar() },
  ];
  const done = steps.filter((x) => x.done).length;
  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T v="h2">{prominent ? 'Arma tu expediente' : 'Completa tu expediente'}</T>
          <T v="small">{done} de 5 pasos · lo que registres queda como “declarado por ti”, con fecha.</T>
        </View>
        <ChevronRight size={20} color={colors.muted} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} />
      </Pressable>
      <Progress value={(done / 5) * 100} />
      {open ? (
        <View style={{ gap: 10, marginTop: 4 }}>
          {steps.map((st) => (
            <Pressable key={st.title} disabled={st.done} onPress={() => go(st.href)} style={[s.step, st.done && { backgroundColor: colors.okSoft, borderColor: colors.okSoft }]} accessibilityRole="button" accessibilityLabel={`${st.title}${st.done ? ', listo' : `. ${st.cta}`}`}>
              {st.done ? <CircleCheck size={22} color={colors.mintDeep} /> : <View style={s.stepMark} />}
              <View style={{ flex: 1 }}>
                <T v="h3">{st.title}</T>
                <T v="small">{st.done ? 'Listo' : st.detail}</T>
                {!st.done ? <T v="small" style={{ color: colors.blue, fontFamily: fonts.semibold, marginTop: 4 }}>{st.cta} →</T> : null}
              </View>
            </Pressable>
          ))}
          {prominent ? <Button variant="secondary" title="Prefiero que me ayude un asesor" onPress={() => go(R.ayuda('asesor'))} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

function Patrimonio({ data }: { data: ClienteInicioResponse }) {
  const p = data.patrimonio;
  if (!p) return null;
  return (
    <Card>
      <T v="eyebrow">Mi patrimonio</T>
      {p.netWorth !== null ? (
        <>
          <T v="big" style={{ marginTop: 6 }}>{pesosCortos(p.netWorth)}</T>
          <T v="small">Vivienda {pesosCortos(p.totalValue)} − deuda {pesosCortos(p.totalDebt)}{p.unvaluedWithLoan ? ' · falta el valor de un inmueble con crédito' : ''}</T>
          {p.range ? <T v="small">Rango del valor: {pesosCortos(p.range.low)} a {pesosCortos(p.range.high)}</T> : null}
          {p.variation ? (
            <T v="small" style={{ color: p.variation.amount >= 0 ? colors.mintDeep : colors.danger, fontFamily: fonts.semibold }}>
              {p.variation.amount >= 0 ? '+' : '−'}{pesosCortos(Math.abs(p.variation.amount))} frente a la valoración anterior ({fecha(p.variation.previousAsOf)})
            </T>
          ) : null}
          {p.confidence ? <Confidence level={p.confidence} source={p.source} asOf={p.asOf ? fecha(p.asOf) : null} /> : null}
          <T v="small" style={{ marginTop: 4 }}>{p.disclaimer}</T>
          <View style={s.actions}>
            <Button small variant="secondary" title="Actualizar valor" onPress={() => go(R.vivienda)} />
            <Button small variant="secondary" title="Solicitar avalúo" onPress={() => go(R.vivienda)} />
          </View>
        </>
      ) : (
        <>
          <T v="big" style={{ marginTop: 6 }}>—</T>
          <T v="small">Deuda registrada: {pesos(p.totalDebt)}</T>
          <T v="small" style={{ marginTop: 4 }}>Registra el valor estimado de tu vivienda para calcular tu patrimonio neto.</T>
          <View style={s.actions}>
            <Button small title={data.onboarding.property ? 'Registrar valor' : 'Registrar inmueble'} onPress={() => go(data.onboarding.property ? R.vivienda : R.inmueble())} />
          </View>
        </>
      )}
    </Card>
  );
}

function Avance({ data }: { data: ClienteInicioResponse }) {
  const a = data.avance;
  return (
    <Card>
      <T v="eyebrow">Mi avance</T>
      {a ? (
        <>
          <T v="big" style={{ marginTop: 6 }}>{a.ownership !== null ? pct(a.ownership, 1) : `${a.paidInstallments} de ${a.termMonths}`}</T>
          <T v="small">{a.ownership !== null ? 'de tu vivienda ya es tuyo en términos económicos' : 'cuotas pagadas'}</T>
          {a.ownership !== null ? <Progress value={a.ownership * 100} /> : null}
          <View style={{ marginTop: 6 }}>
            <KeyValue
              items={[
                ['Capital pagado', a.capitalPaid >= 0 ? pesos(a.capitalPaid) : '—'],
                ['Cuotas', `${a.paidInstallments} de ${a.termMonths}`],
                ['Tiempo restante', a.remainingText],
                ...(a.payoffDate ? ([['Terminarías', fecha(a.payoffDate)]] as [string, string][]) : []),
              ]}
            />
          </View>
          {a.uvrNote ? <T v="small" style={{ marginTop: 6 }}>En UVR el saldo en pesos puede superar el monto prestado por la inflación.</T> : null}
          <Confidence level={a.confidence} source={a.source} asOf={`saldo al ${fecha(a.balanceAsOf)}`} />
          <View style={s.actions}>
            <Button small variant="secondary" title="Ver línea de tiempo" onPress={() => go(R.credito(a.loanId))} />
          </View>
        </>
      ) : (
        <>
          <T style={{ marginTop: 6 }}>Registra tu crédito para ver cuánto has pagado y cuánto falta.</T>
          <View style={s.actions}><Button small title="Registrar crédito" onPress={() => go(R.creditoEditar())} /></View>
        </>
      )}
    </Card>
  );
}

function MejorAccion({ data }: { data: ClienteInicioResponse }) {
  const { best, others, disclaimer } = data.proximaAccion;
  const [showOthers, setShowOthers] = useState(false);
  return (
    <Card dark>
      <T v="eyebrow" style={{ color: '#a9d4d3' }}>Tu próxima mejor acción</T>
      {best ? (
        <>
          <T v="h2" style={{ color: colors.white, marginTop: 6 }}>{best.title}</T>
          <T style={{ color: '#dbe9ec', marginTop: 8 }}><Text style={{ fontFamily: fonts.bold }}>Por qué: </Text>{best.reason}</T>
          <T style={{ color: '#dbe9ec', marginTop: 6 }}><Text style={{ fontFamily: fonts.bold }}>Impacto: </Text>{best.impact}</T>
          {best.requires.length ? <T v="small" style={{ color: '#c4d8dd', marginTop: 6 }}>Necesitas: {best.requires.join(', ')}.</T> : null}
          <View style={{ gap: 8, marginTop: 14 }}>
            <Button title={best.link.label} onPress={() => go(linkHref(best.link))} />
            <Button variant="ghost" title="Hablar con un asesor" onPress={() => go(R.ayuda('asesor'))} />
          </View>
          {others.length ? (
            <View style={{ marginTop: 14 }}>
              <Pressable onPress={() => setShowOthers(!showOthers)} accessibilityRole="button" accessibilityState={{ expanded: showOthers }}>
                <T style={{ color: colors.mint, fontFamily: fonts.semibold }}>{showOthers ? 'Ocultar otras acciones' : `Otras acciones posibles (${others.length})`}</T>
              </Pressable>
              {showOthers ? <View style={{ gap: 8, marginTop: 10 }}>{others.map((a) => <OtherAction key={a.code} a={a} />)}</View> : null}
            </View>
          ) : null}
          <T v="small" style={{ color: '#a9d4d3', marginTop: 12 }}>{disclaimer}</T>
        </>
      ) : (
        <>
          <T v="h2" style={{ color: colors.white, marginTop: 6 }}>Completa tu crédito para recibir una recomendación</T>
          <T style={{ color: '#dbe9ec', marginTop: 8 }}>Con el saldo, la tasa y tus ingresos calculamos qué te conviene: conservar liquidez, revisar seguros, comparar tasas o abonar.</T>
          <Button title={data.onboarding.loan ? 'Revisar mi crédito' : 'Registrar crédito'} onPress={() => go(data.onboarding.loan ? R.credito() : R.creditoEditar())} style={{ marginTop: 14 }} />
        </>
      )}
    </Card>
  );
}

function OtherAction({ a }: { a: NextActionItem }) {
  return (
    <Pressable onPress={() => go(linkHref(a.link))} style={s.other} accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.link.label}`}>
      <View style={{ flex: 1 }}>
        <T v="h3" style={{ color: colors.white }}>{a.title}</T>
        <T v="small" style={{ color: '#c4d8dd' }}>{a.reason}</T>
      </View>
      <ChevronRight size={18} color={colors.mint} />
    </Pressable>
  );
}

function ProximoPago({ data }: { data: ClienteInicioResponse }) {
  const p = data.proximoPago;
  return (
    <Card>
      <T v="eyebrow">Próximo pago</T>
      {p ? (
        <>
          <T v="big" style={{ marginTop: 6 }}>{p.amount !== null ? pesos(p.amount) : '—'}</T>
          <T v="small">Vence el {fecha(p.dueDate)} · {p.alias}{p.entityName ? ` · ${p.entityName}` : ''}</T>
          <View style={{ marginVertical: 8 }}>
            <Pill tone={toneOf(p.status.tone)}>{p.status.code === 'NONE' ? p.status.label : `Pago ${p.status.label.toLowerCase()}${p.status.paidOn ? ` el ${fecha(p.status.paidOn)}` : ''}`}</Pill>
          </View>
          {p.breakdown ? (
            <PesoMap
              parts={[
                { label: 'Capital', value: p.breakdown.principal, color: PESO_COLORS.capital },
                { label: 'Intereses', value: p.breakdown.interest, color: PESO_COLORS.interest },
                { label: 'Seguros', value: p.breakdown.insurance, color: PESO_COLORS.insurance },
              ]}
              caption={p.caption}
            />
          ) : (
            <T v="small">{p.notice}</T>
          )}
          <Button title="Reportar pago" onPress={() => go(R.reportarPago(p.loanId))} style={{ marginTop: 12 }} />
        </>
      ) : (
        <T v="small" style={{ marginTop: 6 }}>Sin crédito registrado.</T>
      )}
    </Card>
  );
}

function Radar({ data }: { data: ClienteInicioResponse }) {
  if (!data.radar.length) return null;
  const labelOf = (t: string) => (t === 'ok' ? 'Bien' : t === 'gray' ? 'Sin datos' : t === 'amber' ? 'Revisar' : 'Atender');
  return (
    <Card>
      <T v="eyebrow">Radar financiero</T>
      <View style={{ gap: 14, marginTop: 10 }}>
        {data.radar.map((item) => (
          <View key={item.title} style={{ flexDirection: 'row', gap: 10 }} accessible accessibilityLabel={`${labelOf(item.tone)}: ${item.title}. ${item.detail}`}>
            <Dot tone={toneOf(item.tone)} />
            <View style={{ flex: 1 }}>
              <T v="h3">{item.title}</T>
              <T v="small">{item.detail}</T>
              {item.link ? (
                <Pressable onPress={() => go(linkHref(item.link!))} accessibilityRole="link">
                  <T v="small" style={{ color: colors.blue, fontFamily: fonts.semibold, marginTop: 4 }}>{item.link.label} →</T>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  step: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.mist },
  stepMark: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#9aacb3' },
  other: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.08)' },
});
