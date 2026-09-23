import { useLocalSearchParams } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RequestDetailResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { fechaHora } from '@/services/format';
import { toneOf } from '@/ui/cliente/components';
import { Button, Card, ErrorState, Field, KeyValue, Loading, Pill, ResultBanner, Screen, Section, T } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';

export default function Solicitud() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, refresh, reload } = useApi<RequestDetailResponse>(`/cliente/solicitudes/${id}`);
  const [body, setBody] = useState('');
  const action = useAction();
  const [now] = useState(() => Date.now());

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;
  const r = data.request;
  const overdue = new Date(r.slaDueAt).getTime() < now;

  async function send() {
    const res = await action.run(`/cliente/solicitudes/${r.id}/mensajes`, { body: body.trim() });
    if (res.ok) {
      setBody('');
      reload();
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <T v="h2" style={{ flex: 1 }}>{r.code} · {r.subject}</T>
        <Pill tone={toneOf(r.status.tone)}>{r.status.label}</Pill>
      </View>
      <Card style={{ marginTop: 12 }}>
        <KeyValue
          items={[
            ['Tipo', r.kindLabel],
            ['Creada', fechaHora(r.createdAt)],
            ['Compromiso de respuesta', r.closed ? 'Cerrada' : `${fechaHora(r.slaDueAt)}${overdue ? ' (vencido: tu solicitud está priorizada)' : ''}`],
          ]}
        />
        {r.resolution ? (
          <View style={{ marginTop: 12 }}>
            <T v="eyebrow">Respuesta final</T>
            <T style={{ marginTop: 4 }} selectable>{r.resolution}</T>
          </View>
        ) : null}
      </Card>

      <Section title="Conversación">
        <Bubble mine author="Tú" at={r.createdAt} body={r.detail} />
        {data.messages.map((m) => <Bubble key={m.id} mine={m.mine} author={m.author} at={m.createdAt} body={m.body} />)}
      </Section>

      <Section title={r.canReply ? 'Responder' : 'Solicitud cerrada'}>
        {r.canReply ? (
          <>
            <Field label="Tu mensaje" value={body} onChangeText={setBody} multiline maxLength={4000} placeholder="Escribe tu respuesta para el equipo." />
            <ResultBanner result={action.result} />
            <Button title="Enviar" icon={<Send size={16} color={colors.navy} />} onPress={send} loading={action.pending} disabled={body.trim().length < 2} />
          </>
        ) : (
          <T v="muted">Esta solicitud está cerrada. Si necesitas algo más, crea una nueva.</T>
        )}
      </Section>
    </Screen>
  );
}

function Bubble({ mine, author, at, body }: { mine: boolean; author: string; at: string; body: string }) {
  return (
    <View style={[s.bubble, mine ? s.mine : s.theirs]} accessible accessibilityLabel={`${author}, ${fechaHora(at)}: ${body}`}>
      <T v="small" style={{ marginBottom: 4 }}>{author} · {fechaHora(at)}</T>
      <T selectable>{body}</T>
    </View>
  );
}

const s = StyleSheet.create({
  bubble: { padding: 12, borderRadius: radius.lg, maxWidth: '92%', borderWidth: 1 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.okSoft, borderColor: '#cdeee4' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderColor: colors.line },
});
