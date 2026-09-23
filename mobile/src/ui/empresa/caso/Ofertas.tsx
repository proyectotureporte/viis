import { BadgeCheck, ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { OfferView } from '@/lib/movil/contract-empresa';
import { fecha, fechaHora, milesInput, pct, pesos } from '@/services/format';
import { Button, Card, Empty, Field, MoneyField, Notice, Pill, Section, Select, T } from '@/ui/kit';
import { DateField } from '@/ui/DateField';
import { colors, fonts, space } from '@/ui/theme';
import { useDialog } from '../dialogs';
import { Line, Pills, Sheet } from '../ui';
import type { CasoCtx } from './types';

const OTHER = '__otra__';

function OfferCard({ o, hasPortfolio }: { o: OfferView; hasPortfolio: boolean }) {
  const r = o.results;
  return (
    <Card style={o.accepted ? { borderColor: colors.mintDeep, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T v="h3" style={{ flex: 1 }}>{o.entityName}</T>
        {o.accepted ? <Pill tone="ok">Aceptada</Pill> : o.expired ? <Pill tone="bad">Vencida</Pill> : null}
      </View>
      <T v="small">{`${o.system.label} · ${pct(o.rateEa, 2)} EA · ${o.termMonths} meses · ${pesos(o.amount)}`}</T>
      <Pills style={{ marginTop: 6 }}>
        {o.bestPayment ? <Pill tone="ok">Mejor cuota</Pill> : null}
        {o.bestTotalCost ? <Pill tone="ok">Menor costo total</Pill> : null}
      </Pills>
      <View style={{ marginTop: space.sm }}>
        <Line label="Cuota mensual" value={pesos(r.payment)} strong />
        <Line label="Intereses totales" value={pesos(r.totalInterest)} />
        <Line label="Seguros totales" value={pesos(r.totalInsurance)} />
        <Line label="Costos iniciales" value={pesos(r.upfrontCosts)} />
        <Line label="Costo total" value={pesos(r.totalCost)} strong />
        <Line label="Costo por millón" value={pesos(r.costPerMillion)} />
        <Line label="Termina" value={fecha(r.payoffDate)} />
        {hasPortfolio ? <Line label="Ahorro neto vs actual" value={r.portfolio ? pesos(r.portfolio.netSavings) : '—'} strong /> : null}
        <Line label="Vigencia" value={o.validUntil ? `${o.expired ? 'Vencida ' : ''}${fecha(o.validUntil)}` : 'Sin fecha'} />
      </View>
      {r.portfolio ? (
        <T v="small" style={{ marginTop: 6 }}>
          {`Frente a ${r.portfolio.loanAlias}: cuota ${pesos(r.portfolio.basePayment)} → ${pesos(r.portfolio.newPayment)} (${pesos(r.portfolio.monthlySavings)}/mes)${r.portfolio.breakEvenMonths ? ` · equilibrio en el mes ${r.portfolio.breakEvenMonths}` : ''}. ${r.portfolio.recommendationText}`}
        </T>
      ) : null}
      {o.conditions ? <T v="small" style={{ marginTop: 4 }}>{`Condiciones: ${o.conditions}`}</T> : null}
      {r.warnings.map((w) => (
        <T key={w} v="small" style={{ color: colors.amber, marginTop: 2 }}>{`⚠ ${w}`}</T>
      ))}
      <T v="small" style={{ marginTop: 6 }}>{`Fuente: ${o.source} · motor ${o.engineVersion} · ${fechaHora(o.createdAt)}${r.uvr ? ` · UVR ${r.uvr.value} con inflación ${pct(r.uvr.inflation, 2)} (${r.uvr.source})` : ''}`}</T>
      {o.accepted ? <T v="small" style={{ marginTop: 6, color: '#08755f' }}>{`Aceptada ${fechaHora(o.accepted.at)} por ${o.accepted.by}${o.accepted.channel ? ` · ${o.accepted.channel}` : ''}${o.accepted.declaration ? ` · “${o.accepted.declaration}”` : ''}`}</T> : null}
    </Card>
  );
}

const EMPTY_FORM = { entity: '', entityOther: '', rateEa: '', system: 'FIXED_PESOS', termMonths: '240', amount: '', monthlyInsurance: '', upfrontCosts: '', validUntil: '', source: '', conditions: '' };

export function Ofertas({ d, act, pending }: CasoCtx) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const accepted = d.offers.find((o) => o.id === d.acceptedOfferId) ?? null;
  const hasPortfolio = d.offers.some((o) => o.results.portfolio);

  function start() {
    setF({ ...EMPTY_FORM, entity: d.case.entity?.name ?? '', amount: d.case.amount ? milesInput(String(d.case.amount)) : '' });
    setError(null);
    setOpen(true);
  }

  async function create() {
    const entityName = f.entity === OTHER ? '' : f.entity;
    if (!entityName && !f.entityOther.trim()) return setError('Elige o escribe la entidad de la oferta.');
    if (!f.rateEa.trim()) return setError('Indica la tasa EA (%).');
    if (!f.source.trim() || f.source.trim().length < 3) return setError('Indica la fuente de la oferta.');
    if (f.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(f.validUntil)) return setError('Elige una fecha de vigencia válida.');
    setError(null);
    const res = await act('/ofertas', {
      entityName: entityName || undefined,
      entityOther: f.entity === OTHER ? f.entityOther.trim() : undefined,
      rateEa: f.rateEa.trim(),
      system: f.system,
      termMonths: f.termMonths,
      amount: f.amount,
      monthlyInsurance: f.monthlyInsurance || undefined,
      upfrontCosts: f.upfrontCosts || undefined,
      validUntil: f.validUntil || undefined,
      source: f.source.trim(),
      conditions: f.conditions.trim() || undefined,
    });
    if (res.ok) setOpen(false);
    else setError(res.message);
  }

  async function accept() {
    const valid = d.offers.filter((o) => !o.expired);
    const v = await dialog.ask({
      title: 'Registrar aceptación del cliente',
      message: 'Solo cuando el cliente vio cuota, costo total, supuestos y vigencia. Queda como evidencia con los resultados que vio.',
      confirmLabel: 'Registrar aceptación',
      fields: [
        { name: 'offerId', label: 'Oferta aceptada', kind: 'select', required: true, options: valid.map((o) => ({ value: o.id, label: `${o.entityName} · ${pesos(o.results.payment)}/mes`, hint: `${pct(o.rateEa, 2)} EA · ${o.termMonths} meses` })) },
        { name: 'channel', label: 'Canal de aceptación', kind: 'select', required: true, options: d.options.acceptChannels, initial: 'PRESENCIAL' },
        { name: 'declaration', label: 'Declaración (qué vio y cómo aceptó)', kind: 'multiline', required: true, minLength: 10, maxLength: 1000, placeholder: 'El cliente revisó cuota, costo total, supuestos y vigencia, y aceptó por…' },
      ],
    });
    if (v) await act(`/ofertas/${v.offerId}/aceptar`, { channel: v.channel, declaration: v.declaration });
  }

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <>
      <Section title="Ofertas y comparación" right={accepted ? <Pill tone="ok">{`Aceptada: ${accepted.entityName}`}</Pill> : undefined}>
        {d.offers.length > 1 ? <Notice tone="info">Comparación normalizada con el mismo motor financiero: cuota, costo total (intereses + seguros + costos iniciales) y costo por millón prestado.</Notice> : null}
        {d.offers.length === 0 ? <Empty>Aún no hay ofertas. Registra la primera con su fuente para comparar alternativas normalizadas.</Empty> : null}
        {d.offers.map((o) => (
          <OfferCard key={o.id} o={o} hasPortfolio={hasPortfolio} />
        ))}
        {d.offers[0]?.results.assumptions.length ? (
          <Card>
            <Pressable onPress={() => setShowAssumptions(!showAssumptions)} accessibilityRole="button" accessibilityState={{ expanded: showAssumptions }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="eyebrow">{`Supuestos del motor (${d.offers[0].results.assumptions.length})`}</T>
              {showAssumptions ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}
            </Pressable>
            {showAssumptions
              ? d.offers[0].results.assumptions.map((a) => (
                  <T key={a} v="small" style={{ marginTop: 4 }}>{`• ${a}`}</T>
                ))
              : null}
          </Card>
        ) : null}
        <View style={{ gap: 8 }}>
          {d.can.createOffer && !d.case.closed ? <Button title="Registrar oferta" icon={<Plus size={18} color={colors.navy} />} onPress={start} /> : null}
          {d.can.acceptOffer && !accepted && d.offers.some((o) => !o.expired) ? <Button title="Registrar aceptación del cliente" variant="secondary" icon={<BadgeCheck size={18} color={colors.ink} />} onPress={accept} loading={pending} /> : null}
        </View>
      </Section>

      <Sheet visible={open} title="Registrar oferta" onClose={() => setOpen(false)} footer={<Button title="Calcular y registrar" onPress={create} loading={pending} />}>
        <T v="small">Se calcula con el motor financiero (cuota, costo total y ahorro frente al crédito actual). La fuente es obligatoria.</T>
        <Select label="Entidad" value={f.entity} options={[...d.options.entities.map((e) => ({ value: e.label, label: e.label })), { value: OTHER, label: 'Otra entidad…' }]} onChange={set('entity')} />
        {f.entity === OTHER ? <Field label="Nombre de la otra entidad" value={f.entityOther} onChangeText={set('entityOther')} maxLength={120} /> : null}
        <Field label="Tasa EA (%)" value={f.rateEa} onChangeText={set('rateEa')} keyboardType="decimal-pad" placeholder="Ej. 12,5" />
        <Select label="Sistema de amortización" value={f.system} options={d.options.offerSystems} onChange={set('system')} />
        <Field label="Plazo (meses, 12 a 360)" value={f.termMonths} onChangeText={(t) => set('termMonths')(t.replace(/\D/g, ''))} keyboardType="number-pad" />
        <MoneyField label="Monto" value={f.amount} onChangeText={set('amount')} placeholder="$" />
        <MoneyField label="Seguros mensuales (opcional)" value={f.monthlyInsurance} onChangeText={set('monthlyInsurance')} placeholder="0" />
        <MoneyField label="Costos iniciales: estudio, avalúo, notariales (opcional)" value={f.upfrontCosts} onChangeText={set('upfrontCosts')} placeholder="0" />
        <DateField label="Vigencia hasta" value={f.validUntil} onChange={set('validUntil')} optional />
        <Field label="Fuente" value={f.source} onChangeText={set('source')} placeholder="Ej. Oferta escrita de la entidad del 20-sep-2026" maxLength={200} />
        <Field label="Condiciones (opcional)" value={f.conditions} onChangeText={set('conditions')} multiline maxLength={2000} />
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <T v="small" style={{ fontFamily: fonts.semibold }}>El cliente verá la alternativa en su app con cuota estimada y supuestos.</T>
      </Sheet>
    </>
  );
}
