import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { GestionesResponse } from '@/lib/movil/contract';
import { formData } from '@/services/api';
import { useAction, useApi } from '@/services/hooks';
import { hoyIso, soloDigitos } from '@/services/format';
import { dateProblem, DateField, FilePicker } from '@/ui/cliente/components';
import { appendFile, type PickedFile } from '@/ui/cliente/files';
import { backTo, go, R } from '@/ui/cliente/nav';
import { Button, Checkbox, Empty, ErrorState, Field, Loading, MoneyField, Notice, ResultBanner, Screen, Segmented, Select, T } from '@/ui/kit';

export default function ReportarPago() {
  const params = useLocalSearchParams<{ loanId?: string }>();
  const { data, error, loading, reload } = useApi<GestionesResponse>('/cliente/gestiones');
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;
  if (!data.loans.length) {
    return (
      <Screen>
        <Empty>Para reportar pagos primero registra tu crédito.</Empty>
        <Button title="Registrar crédito" onPress={() => go(R.creditoEditar())} style={{ marginTop: 12 }} />
      </Screen>
    );
  }
  return <PaymentForm data={data} defaultLoan={data.loans.some((l) => l.id === params.loanId) ? params.loanId! : data.loans[0].id} />;
}

function PaymentForm({ data, defaultLoan }: { data: GestionesResponse; defaultLoan: string }) {
  const today = hoyIso();
  const [loanId, setLoanId] = useState(defaultLoan);
  const [kind, setKind] = useState<'INSTALLMENT' | 'PREPAYMENT'>('INSTALLMENT');
  const [applyMode, setApplyMode] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [ack, setAck] = useState(false);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const action = useAction();

  const errors = {
    paidOn: dateProblem(paidOn, { required: true, max: today, maxText: 'La fecha del pago no puede ser futura.' }),
    amount: soloDigitos(amount) >= 1000 ? undefined : 'Indica el valor pagado.',
    channel: channel ? undefined : 'Elige el canal de pago.',
    applyMode: kind === 'PREPAYMENT' && !applyMode ? 'Indica si el abono reduce plazo o cuota.' : undefined,
    file: file ? undefined : 'Adjunta el soporte del pago.',
    ack: ack ? undefined : 'Confirma que entiendes que el soporte no reemplaza el pago.',
  };
  const problems = Object.values(errors).filter(Boolean) as string[];

  async function submit() {
    setTried(true);
    if (problems.length || !file) return;
    setSending(true);
    setFileError(null);
    try {
      const form = formData({ loanId, kind, applyMode: kind === 'PREPAYMENT' ? applyMode : undefined, paidOn, amount, channel, reference: reference.trim() || undefined, ack: true });
      await appendFile(form, 'file', file);
      const res = await action.run('/cliente/pagos', form);
      if (res.ok) {
        setAmount('');
        setReference('');
        setFile(null);
        setAck(false);
        setTried(false);
      }
    } catch {
      setFileError('No pudimos leer el archivo. Elígelo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <T v="muted" style={{ marginBottom: 12 }}>Registra aquí el soporte de un pago que ya hiciste a tu entidad. Operación lo compara con tu extracto y te avisa el resultado.</T>
      <Notice tone="bad">{data.paymentWarning} Primero paga a tu entidad por sus canales; OpenV no recibe pagos.</Notice>
      <View style={{ gap: 14, marginTop: 16 }}>
        {data.loans.length > 1 ? <Select label="Crédito" value={loanId} options={data.loans.map((l) => ({ value: l.id, label: l.label }))} onChange={setLoanId} /> : <Field label="Crédito" value={data.loans[0].label} editable={false} />}
        <View style={{ gap: 6 }}>
          <T v="small">¿Qué pagaste?</T>
          <Segmented value={kind} options={[{ value: 'INSTALLMENT', label: 'Cuota' }, { value: 'PREPAYMENT', label: 'Abono a capital' }]} onChange={(v) => setKind(v as 'INSTALLMENT' | 'PREPAYMENT')} />
        </View>
        {kind === 'PREPAYMENT' ? (
          <Select label="El abono lo apliqué a" value={applyMode} options={[{ value: 'TERM', label: 'Reducir el plazo (misma cuota)' }, { value: 'PAYMENT', label: 'Reducir la cuota (mismo plazo)' }]} onChange={setApplyMode} placeholder="Elige" />
        ) : null}
        {tried && errors.applyMode ? <T v="small" style={{ color: '#b73c3c' }}>{errors.applyMode}</T> : null}
        <DateField label="Fecha del pago" value={paidOn} onChange={setPaidOn} shortcuts={[{ label: 'Hoy', value: today }]} error={tried || paidOn.length === 10 ? errors.paidOn : undefined} />
        <MoneyField label="Valor pagado ($)" value={amount} onChangeText={setAmount} placeholder="1.250.000" error={tried ? errors.amount : undefined} />
        <Select label="Canal de pago" value={channel} options={data.paymentChannels.map((c) => ({ value: c, label: c }))} onChange={setChannel} placeholder="Elige" />
        {tried && errors.channel ? <T v="small" style={{ color: '#b73c3c' }}>{errors.channel}</T> : null}
        <Field label="Referencia o número de aprobación (opcional)" value={reference} onChangeText={setReference} maxLength={80} autoCapitalize="characters" />
        <FilePicker label="Soporte del pago" value={file} onChange={setFile} prefix="soporte-pago" />
        {tried && errors.file ? <T v="small" style={{ color: '#b73c3c' }}>{errors.file}</T> : null}
        <Checkbox checked={ack} onChange={setAck}>Entiendo que cargar este soporte no sustituye pagar al acreedor ni garantiza la imputación del pago.</Checkbox>
        {tried && errors.ack ? <T v="small" style={{ color: '#b73c3c' }}>{errors.ack}</T> : null}
        <ResultBanner result={fileError ? { ok: false, message: fileError } : action.result} />
        <Button title="Reportar pago" onPress={submit} loading={sending || action.pending} />
        {action.result?.ok ? <Button variant="secondary" title="Ver mis pagos" onPress={() => backTo(R.gestiones('pagos'))} /> : null}
      </View>
    </Screen>
  );
}
