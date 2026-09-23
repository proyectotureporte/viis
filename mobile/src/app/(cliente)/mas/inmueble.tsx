import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { PropertyView, ViviendaResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { go, R } from '@/ui/cliente/nav';
import { Button, Checkbox, Empty, ErrorState, Field, Loading, ResultBanner, Screen, Select, T } from '@/ui/kit';

export default function Inmueble() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, error, loading, reload } = useApi<ViviendaResponse>('/cliente/vivienda');
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;
  const property = id ? data.properties.find((p) => p.id === id) : undefined;
  if (id && !property) return <Screen><Empty>No encontramos este inmueble.</Empty></Screen>;
  return <PropertyForm kinds={data.kinds} property={property} />;
}

function PropertyForm({ kinds, property }: { kinds: ViviendaResponse['kinds']; property?: PropertyView }) {
  const [id, setId] = useState(property?.id);
  const [alias, setAlias] = useState(property?.alias ?? '');
  const [address, setAddress] = useState(property?.address ?? '');
  const [city, setCity] = useState(property?.city ?? '');
  const [kind, setKind] = useState(property?.kind ?? '');
  const [stratum, setStratum] = useState(property?.stratum ? String(property.stratum) : '');
  const [area, setArea] = useState(property?.areaM2 ? String(property.areaM2).replace('.', ',') : '');
  const [isVis, setIsVis] = useState(property?.isVis ?? false);
  const [tried, setTried] = useState(false);
  const action = useAction();

  const areaNum = Number(area.replace(',', '.'));
  const errors = {
    alias: alias.trim() ? undefined : 'Ponle un nombre (por ejemplo, "Apartamento Chapinero").',
    kind: kind ? undefined : 'Elige el tipo de inmueble.',
    stratum: !stratum || (/^[1-6]$/.test(stratum)) ? undefined : 'El estrato va de 1 a 6.',
    area: !area || (Number.isFinite(areaNum) && areaNum > 0) ? undefined : 'Área inválida.',
  };
  const valid = Object.values(errors).every((e) => !e);

  async function submit() {
    setTried(true);
    if (!valid) return;
    const res = await action.run('/cliente/vivienda', {
      ...(id ? { id } : {}),
      alias: alias.trim(),
      address: address.trim(),
      city: city.trim(),
      kind,
      stratum,
      areaM2: area,
      isVis,
    });
    if (res.ok && !id && typeof res.id === 'string') setId(res.id);
  }

  return (
    <Screen>
      <T v="muted" style={{ marginBottom: 16 }}>Los datos quedan como declarados por ti. La dirección es opcional; la usamos solo para tu expediente.</T>
      <View style={{ gap: 14 }}>
        <Field label="Nombre del inmueble" value={alias} onChangeText={setAlias} maxLength={80} placeholder="Apartamento Chapinero" error={tried ? errors.alias : undefined} />
        <Select label="Tipo de inmueble" value={kind} options={kinds.map((k) => ({ value: k.code, label: k.label }))} onChange={setKind} placeholder="Elige" />
        {tried && errors.kind ? <T v="small" style={{ color: '#b73c3c' }}>{errors.kind}</T> : null}
        <Field label="Ciudad" value={city} onChangeText={setCity} maxLength={120} placeholder="Bogotá" />
        <Field label="Dirección (opcional)" value={address} onChangeText={setAddress} maxLength={240} />
        <Field label="Estrato (opcional)" value={stratum} onChangeText={(t) => setStratum(t.replace(/\D/g, '').slice(0, 1))} keyboardType="number-pad" error={tried || stratum ? errors.stratum : undefined} />
        <Field label="Área en m² (opcional)" value={area} onChangeText={(t) => setArea(t.replace(/[^\d,]/g, ''))} keyboardType="decimal-pad" placeholder="72,5" error={tried || area ? errors.area : undefined} />
        <Checkbox checked={isVis} onChange={setIsVis}>Es vivienda de interés social (VIS)</Checkbox>
        <ResultBanner result={action.result} />
        <Button title={id ? 'Guardar cambios' : 'Registrar inmueble'} onPress={submit} loading={action.pending} />
        {action.result?.ok && id ? <Button variant="secondary" title="Registrar el valor de la vivienda" onPress={() => go(R.valor(id))} /> : null}
      </View>
    </Screen>
  );
}
