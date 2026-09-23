import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { ViviendaResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { hoyIso, soloDigitos } from '@/services/format';
import { dateProblem, DateField } from '@/ui/cliente/components';
import { backTo, R } from '@/ui/cliente/nav';
import { Button, Empty, ErrorState, Field, Loading, MoneyField, Notice, ResultBanner, Screen, Select, T } from '@/ui/kit';

export default function Valor() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { data, error, loading, reload } = useApi<ViviendaResponse>('/cliente/vivienda');
  const today = hoyIso();
  const [value, setValue] = useState('');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [asOf, setAsOf] = useState(today);
  const [basis, setBasis] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const action = useAction();

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const property = data?.properties.find((p) => p.id === propertyId);
  if (!data || !property) return <Screen><Empty>No encontramos este inmueble.</Empty></Screen>;

  const v = soloDigitos(value);
  const lo = soloDigitos(low);
  const hi = soloDigitos(high);
  const errors = {
    value: v >= 10_000_000 ? undefined : 'Revisa el valor: parece muy bajo para una vivienda.',
    range: (low && high && lo > hi) || (low && lo > v) || (high && hi < v) ? 'El rango debe contener el valor (mínimo ≤ valor ≤ máximo).' : undefined,
    asOf: dateProblem(asOf, { required: true, max: today, maxText: 'La fecha no puede ser futura.' }),
    basis: basis ? undefined : 'Cuéntanos en qué te basas.',
  };
  const valid = Object.values(errors).every((e) => !e);

  async function submit() {
    setTried(true);
    if (!valid) return;
    await action.run('/cliente/vivienda/valor', { propertyId, value, ...(low ? { low } : {}), ...(high ? { high } : {}), asOf, basis, ...(note.trim() ? { note: note.trim() } : {}) });
  }

  return (
    <Screen>
      <T v="h2">{property.alias}</T>
      <T v="muted" style={{ marginTop: 4, marginBottom: 12 }}>¿Cuánto crees que vale hoy tu vivienda? Queda como valor declarado por ti, con fecha y la base que indiques. No es un avalúo.</T>
      <View style={{ gap: 14 }}>
        <MoneyField label="Valor estimado ($)" value={value} onChangeText={setValue} placeholder="350.000.000" error={tried ? errors.value : undefined} />
        <MoneyField label="Mínimo del rango ($, opcional)" value={low} onChangeText={setLow} />
        <MoneyField label="Máximo del rango ($, opcional)" value={high} onChangeText={setHigh} error={tried ? errors.range : undefined} />
        <DateField label="¿A qué fecha corresponde?" value={asOf} onChange={setAsOf} shortcuts={[{ label: 'Hoy', value: today }]} error={tried || asOf.length === 10 ? errors.asOf : undefined} />
        <Select label="¿En qué te basas?" value={basis} options={data.valueBases.map((b) => ({ value: b.code, label: b.label }))} onChange={setBasis} placeholder="Elige" />
        {tried && errors.basis ? <T v="small" style={{ color: '#b73c3c' }}>{errors.basis}</T> : null}
        <Field label="Nota (opcional)" value={note} onChangeText={setNote} multiline maxLength={400} placeholder="Por ejemplo: un apartamento igual en el edificio se vendió en…" />
        <Notice tone="info">Para trámites con bancos se necesita un avalúo de un perito; puedes solicitarlo desde Mi vivienda.</Notice>
        <ResultBanner result={action.result} />
        <Button title="Guardar valor" onPress={submit} loading={action.pending} disabled={Boolean(action.result?.ok)} />
        {action.result?.ok ? <Button variant="secondary" title="Volver a Mi vivienda" onPress={() => backTo(R.vivienda)} /> : null}
      </View>
    </Screen>
  );
}
