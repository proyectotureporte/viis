import { useLocalSearchParams } from 'expo-router';
import { Copy, Download, Pencil, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { EscenariosResponse, ScenarioView } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { fechaHora } from '@/services/format';
import { Lines, SimDisclosure } from '@/ui/cliente/components';
import { openProtectedPdf } from '@/ui/cliente/files';
import { go, R } from '@/ui/cliente/nav';
import { Button, Card, Empty, ErrorState, Field, Loading, Pill, ResultBanner, Screen, Section, T } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function Escenario() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, refresh, reload } = useApi<EscenariosResponse>('/cliente/escenarios');
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const sc = data?.scenarios.find((x) => x.id === id);
  if (!data || !sc) return <Screen><Empty>No encontramos este escenario. Puede que lo hayas abierto desde otro dispositivo o ya no exista.</Empty></Screen>;
  return <Detail key={sc.id} sc={sc} notBinding={data.notBinding} refreshing={refreshing} onRefresh={refresh} reload={reload} />;
}

function Detail({ sc, notBinding, refreshing, onRefresh, reload }: { sc: ScenarioView; notBinding: string; refreshing: boolean; onRefresh: () => void; reload: () => void }) {
  const [name, setName] = useState(sc.name);
  const [note, setNote] = useState('');
  const [panel, setPanel] = useState<'rename' | 'share' | null>(null);
  const action = useAction();
  const [pdf, setPdf] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });

  async function rename() {
    const res = await action.run(`/cliente/escenarios/${sc.id}/renombrar`, { name: name.trim() });
    if (res.ok) {
      setPanel(null);
      reload();
    }
  }
  async function duplicate() {
    const res = await action.run(`/cliente/escenarios/${sc.id}/duplicar`);
    if (res.ok) {
      reload();
      if (typeof res.id === 'string') go(R.escenario(res.id));
    }
  }
  async function share() {
    const res = await action.run(`/cliente/escenarios/${sc.id}/compartir`, note.trim() ? { note: note.trim() } : {});
    if (res.ok) {
      setPanel(null);
      reload();
    }
  }
  async function download() {
    setPdf({ pending: true, error: null });
    try {
      await openProtectedPdf(sc.pdfUrl, `Escenario ${sc.name}`);
      setPdf({ pending: false, error: null });
    } catch (e) {
      setPdf({ pending: false, error: e instanceof Error ? e.message : 'No pudimos descargar el PDF.' });
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <T v="eyebrow">{sc.kindLabel}</T>
      <T v="title" style={{ marginTop: 4 }}>{sc.name}</T>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        <T v="small">Guardado {fechaHora(sc.createdAt)}</T>
        {sc.sharedWithAdvisor ? <Pill tone="info">Compartido con asesor</Pill> : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <Button small title="PDF" icon={<Download size={16} color={colors.navy} />} onPress={download} loading={pdf.pending} />
        <Button small variant="secondary" title="Renombrar" icon={<Pencil size={16} color={colors.ink} />} onPress={() => setPanel(panel === 'rename' ? null : 'rename')} />
        <Button small variant="secondary" title="Duplicar" icon={<Copy size={16} color={colors.ink} />} onPress={duplicate} disabled={action.pending} />
        <Button small variant="secondary" title="Compartir con asesor" icon={<Share2 size={16} color={colors.ink} />} onPress={() => setPanel(panel === 'share' ? null : 'share')} />
      </View>
      {pdf.error ? <View style={{ marginTop: 10 }}><ResultBanner result={{ ok: false, message: pdf.error }} /></View> : null}

      {panel === 'rename' ? (
        <Card style={{ marginTop: 12 }}>
          <Field label="Nuevo nombre" value={name} onChangeText={setName} maxLength={120} />
          <Button title="Guardar nombre" onPress={rename} loading={action.pending} disabled={!name.trim() || name.trim() === sc.name} style={{ marginTop: 10 }} />
        </Card>
      ) : null}
      {panel === 'share' ? (
        <Card style={{ marginTop: 12 }}>
          <T v="small" style={{ marginBottom: 10 }}>Un asesor revisará este escenario contigo. Se crea una solicitud con código y tiempo de respuesta.</T>
          <Field label="Comentario para el asesor (opcional)" value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Por ejemplo: quiero saber si me conviene más abonar o trasladar." />
          <Button title="Compartir" onPress={share} loading={action.pending} style={{ marginTop: 10 }} />
        </Card>
      ) : null}
      <View style={{ marginTop: 12 }}>
        <ResultBanner result={action.result} />
        {action.result?.ok && action.result.message.startsWith('Compartido') ? <Button small variant="secondary" title="Ver mis solicitudes" onPress={() => go(R.gestiones('solicitudes'))} style={{ marginTop: 8 }} /> : null}
      </View>

      <Section title="Resultados">
        <Card><Lines lines={sc.summary} /></Card>
      </Section>
      {sc.inputsSummary.length ? (
        <Section title="Datos que usaste">
          <Card><Lines lines={sc.inputsSummary} /></Card>
        </Section>
      ) : null}
      <Section title="Advertencias y supuestos">
        <SimDisclosure warnings={sc.warnings} assumptions={sc.assumptions} notBinding={notBinding} engineVersion={sc.engineVersion} />
        <T v="small">Huella de entradas: {sc.inputsHash.slice(0, 16)}… (permite reproducir el cálculo).</T>
      </Section>
    </Screen>
  );
}
