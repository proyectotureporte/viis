import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { percentInputText } from '@/lib/cliente/format';
import type { CreditoResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { hoyIso, milesInput, soloDigitos } from '@/services/format';
import { dateProblem, DateField } from '@/ui/cliente/components';
import { backTo, R } from '@/ui/cliente/nav';
import { Button, Card, ErrorState, Field, Loading, MoneyField, Notice, ResultBanner, Screen, Section, Select, T } from '@/ui/kit';

interface Form {
  alias: string;
  entityId: string;
  system: string;
  rateEa: string;
  termMonths: string;
  paidInstallments: string;
  originalAmount: string;
  disbursedAt: string;
  paymentDay: string;
  balance: string;
  balanceAsOf: string;
  monthlyInsurance: string;
  propertyId: string;
}

const CLOSE_REASONS = [
  { value: 'PAID_OFF', label: 'Lo terminé de pagar' },
  { value: 'TRANSFERRED', label: 'Lo trasladé a otra entidad' },
  { value: 'ERROR', label: 'Lo registré por error' },
];

export default function EditarCredito() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { data, error, loading, reload } = useApi<CreditoResponse>(`/cliente/credito${params.id ? `?id=${params.id}` : ''}`);
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;
  return <LoanForm data={data} initialId={params.id} />;
}

function initialForm(data: CreditoResponse, id: string | undefined, today: string): Form {
  const l = id ? data.selected?.loan : null;
  return {
    alias: l?.alias ?? '',
    entityId: l?.entityId ?? '',
    system: l?.system ?? 'FIXED_PESOS',
    rateEa: l ? percentInputText(l.rateEa, 4) : '',
    termMonths: l ? String(l.termMonths) : '',
    paidInstallments: l ? String(l.paidInstallments) : '0',
    originalAmount: l ? milesInput(String(l.originalAmount)) : '',
    disbursedAt: l?.disbursedAt ?? '',
    paymentDay: l ? String(l.paymentDay) : '',
    balance: l ? milesInput(String(l.balance)) : '',
    balanceAsOf: l?.balanceAsOf ?? today,
    monthlyInsurance: l ? milesInput(String(l.monthlyInsurance)) : '',
    propertyId: l?.propertyId ?? (data.properties.length === 1 ? data.properties[0].id : ''),
  };
}

function LoanForm({ data, initialId }: { data: CreditoResponse; initialId?: string }) {
  const today = hoyIso();
  const [loanId, setLoanId] = useState<string | undefined>(initialId);
  const [form, setForm] = useState<Form>(() => initialForm(data, initialId, today));
  const save = useAction();
  const close = useAction();
  const [tried, setTried] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const set = (k: keyof Form) => (v: string) => setForm({ ...form, [k]: v });
  const rate = Number(form.rateEa.replace(',', '.'));
  const term = Number(form.termMonths);
  const paid = Number(form.paidInstallments);
  const day = Number(form.paymentDay);
  const errors: Partial<Record<keyof Form, string>> = {
    alias: form.alias.trim() ? undefined : 'Ponle un nombre (por ejemplo, "Crédito apartamento").',
    rateEa: form.rateEa && Number.isFinite(rate) && rate > 0 && rate <= 60 ? undefined : 'Escribe la tasa EA en porcentaje (por ejemplo 12,5).',
    termMonths: Number.isInteger(term) && term >= 12 && term <= 480 ? undefined : 'Plazo entre 12 y 480 meses.',
    paidInstallments: form.paidInstallments !== '' && Number.isInteger(paid) && paid >= 0 && (!term || paid <= term) ? undefined : 'Cuotas pagadas: un número entre 0 y el plazo.',
    originalAmount: soloDigitos(form.originalAmount) >= 1_000_000 ? undefined : 'Revisa el monto original (mínimo $1.000.000).',
    disbursedAt: dateProblem(form.disbursedAt, { required: true, max: today, maxText: 'La fecha de desembolso no puede ser futura.' }),
    paymentDay: Number.isInteger(day) && day >= 1 && day <= 31 ? undefined : 'Día de pago entre 1 y 31.',
    balance: soloDigitos(form.balance) >= 1 ? undefined : 'Indica el saldo de capital actual.',
    balanceAsOf: dateProblem(form.balanceAsOf, { required: true, max: today, maxText: 'La fecha del saldo no puede ser futura.', min: form.disbursedAt || undefined, minText: 'La fecha del saldo no puede ser anterior al desembolso.' }),
  };
  const valid = Object.values(errors).every((e) => !e);
  const err = (k: keyof Form) => (tried ? errors[k] : undefined);

  async function submit() {
    setTried(true);
    if (!valid) return;
    const res = await save.run('/cliente/credito', {
      ...(loanId ? { id: loanId } : {}),
      alias: form.alias.trim(),
      entityId: form.entityId,
      propertyId: form.propertyId,
      system: form.system,
      rateEa: form.rateEa.trim(),
      termMonths: form.termMonths,
      originalAmount: form.originalAmount,
      disbursedAt: form.disbursedAt,
      balance: form.balance,
      balanceAsOf: form.balanceAsOf,
      paidInstallments: form.paidInstallments,
      monthlyInsurance: form.monthlyInsurance || '0',
      paymentDay: form.paymentDay,
    });
    // Tras crear, el formulario pasa a editar ese crédito (evita duplicarlo).
    if (res.ok && !loanId && typeof res.id === 'string') setLoanId(res.id);
  }

  async function doClose() {
    if (!loanId || !reason) return;
    const res = await close.run('/cliente/credito/cerrar', { id: loanId, reason });
    if (res.ok) setConfirmClose(false);
  }

  const entityOptions = [{ value: '', label: 'Otra / no está en la lista' }, ...data.entities.map((e) => ({ value: e.id, label: e.name }))];
  const propertyOptions = [{ value: '', label: data.properties.length ? 'Sin asociar' : 'Aún no registras inmuebles' }, ...data.properties.map((p) => ({ value: p.id, label: p.alias }))];

  if (close.result?.ok) {
    return (
      <Screen>
        <ResultBanner result={close.result} />
        <Button title="Volver a Mi crédito" onPress={() => backTo(R.credito())} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <T v="h2">{loanId ? 'Actualiza tu crédito' : 'Registra tu crédito'}</T>
      <T v="muted" style={{ marginTop: 4, marginBottom: 16 }}>
        Copia los datos de tu extracto más reciente. Lo que registres queda como dato declarado por ti, con fecha y versión; si un asesor lo verifica con tu extracto, pasa a confirmado.
      </T>
      <View style={{ gap: 14 }}>
        <Field label="Nombre del crédito" value={form.alias} onChangeText={set('alias')} maxLength={80} placeholder="Crédito apartamento" error={err('alias')} />
        <Select label="Entidad" value={form.entityId} options={entityOptions} onChange={set('entityId')} />
        <Select
          label="Sistema"
          value={form.system}
          options={[
            { value: 'FIXED_PESOS', label: 'Tasa fija en pesos' },
            { value: 'UVR', label: 'UVR (se ajusta con la inflación)', hint: 'La cuota y el saldo en pesos cambian con la inflación.' },
          ]}
          onChange={set('system')}
        />
        <Field label="Tasa efectiva anual (EA) %" value={form.rateEa} onChangeText={set('rateEa')} keyboardType="decimal-pad" placeholder="12,5" hint={form.system === 'UVR' ? 'En UVR, la tasa adicional a la UVR.' : 'Aparece en tu extracto o pagaré.'} error={err('rateEa')} />
        <Field label="Plazo total (meses)" value={form.termMonths} onChangeText={(t) => set('termMonths')(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="240" error={err('termMonths')} />
        <Field label="Cuotas ya pagadas" value={form.paidInstallments} onChangeText={(t) => set('paidInstallments')(t.replace(/\D/g, ''))} keyboardType="number-pad" error={err('paidInstallments')} />
        <MoneyField label="Monto original prestado ($)" value={form.originalAmount} onChangeText={set('originalAmount')} placeholder="200.000.000" error={err('originalAmount')} />
        <DateField label="Fecha de desembolso" value={form.disbursedAt} onChange={set('disbursedAt')} error={err('disbursedAt') ?? (form.disbursedAt.length === 10 ? errors.disbursedAt : undefined)} />
        <Field label="Día de pago de la cuota" value={form.paymentDay} onChangeText={(t) => set('paymentDay')(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="5" error={err('paymentDay')} />
        <MoneyField label="Saldo de capital actual ($)" value={form.balance} onChangeText={set('balance')} placeholder="150.000.000" hint="El saldo de capital de tu último extracto." error={err('balance')} />
        <DateField label="Fecha de ese saldo" value={form.balanceAsOf} onChange={set('balanceAsOf')} shortcuts={[{ label: 'Hoy', value: today }]} error={err('balanceAsOf') ?? (form.balanceAsOf.length === 10 ? errors.balanceAsOf : undefined)} />
        <MoneyField label="Seguros mensuales ($)" value={form.monthlyInsurance} onChangeText={set('monthlyInsurance')} placeholder="0" hint="Vida + incendio y terremoto, según extracto." />
        <Select label="Inmueble que respalda el crédito" value={form.propertyId} options={propertyOptions} onChange={set('propertyId')} />
        {tried && !valid ? <Notice tone="bad">Revisa los campos marcados en rojo.</Notice> : null}
        <ResultBanner result={save.result} />
        <Button title={loanId ? 'Guardar cambios' : 'Registrar crédito'} onPress={submit} loading={save.pending} />
        {save.result?.ok ? <Button variant="secondary" title="Ver mi crédito" onPress={() => backTo(R.credito())} /> : null}
      </View>

      {loanId ? (
        <Section title="Ya no tengo este crédito">
          <Card>
            <T v="small" style={{ marginBottom: 12 }}>Ciérralo si lo pagaste, lo trasladaste o lo registraste por error. Queda en tu historial; no se borra.</T>
            <Select label="Motivo" value={reason} options={CLOSE_REASONS} onChange={(v) => { setReason(v); setConfirmClose(false); }} />
            {confirmClose ? (
              <View style={{ gap: 8, marginTop: 12 }}>
                <Notice>¿Seguro? El crédito dejará de aparecer en tu inicio, en los simuladores y en los reportes de pago.</Notice>
                <Button variant="danger" title="Sí, cerrar crédito" onPress={doClose} loading={close.pending} />
                <Button variant="secondary" title="Cancelar" onPress={() => setConfirmClose(false)} />
              </View>
            ) : (
              <Button variant="secondary" title="Cerrar crédito" disabled={!reason} onPress={() => setConfirmClose(true)} style={{ marginTop: 12 }} />
            )}
            <View style={{ marginTop: 10 }}><ResultBanner result={close.result} /></View>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
