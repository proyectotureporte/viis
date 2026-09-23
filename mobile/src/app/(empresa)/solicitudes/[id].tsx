import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { SolicitudResponse } from '@/lib/movil/contract-empresa';
import { decimal, fechaHora } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Field, Notice, Section, Segmented, Select, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useEmpresa } from '@/ui/empresa/context';
import { useDialog } from '@/ui/empresa/dialogs';
import { useLoad } from '@/ui/empresa/hooks';
import { routes } from '@/ui/empresa/nav';
import { LabelPill, Line, Loadable, Page, Pills, ResultFooter, SlaPill } from '@/ui/empresa/ui';

/** Detalle de una solicitud del cliente: hilo, respuesta o nota interna, estado, asignación y cierre. */
export default function Solicitud() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLoad<SolicitudResponse>(`/empresa/solicitudes/${id}`);
  const action = useAction();
  const dialog = useDialog();
  const { refreshMenu, can } = useEmpresa();
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'reply' | 'internal'>('reply');

  async function run(sub: string, payload: Record<string, unknown> = {}) {
    const res = await action.run(`/empresa/solicitudes/${id}${sub}`, payload);
    if (res.ok) {
      q.reload();
      void refreshMenu(true);
    }
    return res;
  }

  async function send(closed: boolean) {
    const internal = closed || mode === 'internal';
    if (body.trim().length < 2) return;
    if (!internal) {
      const ok = await dialog.confirm({ title: 'Responder al cliente', message: 'El cliente verá este mensaje en su app y recibirá una notificación.', confirmLabel: 'Enviar respuesta' });
      if (!ok) return;
    }
    const res = await run('/mensajes', { body: body.trim(), internal: internal || undefined });
    if (res.ok) setBody('');
  }

  async function assign(d: SolicitudResponse, assigneeId: string) {
    const name = assigneeId ? d.options.staff.find((s) => s.id === assigneeId)?.name : 'Sin asignar';
    if (await dialog.confirm({ title: 'Asignar solicitud', message: `${d.request.code} quedará a cargo de: ${name}.`, confirmLabel: 'Asignar' })) await run('/asignar', { assigneeId });
  }

  async function resolve(d: SolicitudResponse) {
    const v = await dialog.ask({
      title: 'Cerrar solicitud',
      message: 'El cliente recibe la resolución. Después solo se pueden agregar notas internas.',
      confirmLabel: 'Cerrar solicitud',
      destructive: true,
      fields: [
        { name: 'outcome', label: 'Resultado', kind: 'select', required: true, options: d.options.outcomes, initial: 'RESOLVED' },
        { name: 'resolution', label: 'Resolución (la verá el cliente)', kind: 'multiline', required: true, minLength: 10, maxLength: 2000 },
      ],
    });
    if (v) await run('/resolver', v);
  }

  return (
    <>
      <Stack.Screen options={{ title: q.data?.request.code ?? 'Solicitud' }} />
      <Page refreshing={q.refreshing} onRefresh={q.refresh} footer={action.result ? <ResultFooter result={action.result} onClose={action.clear} /> : undefined}>
        <Loadable q={q}>
          {(d) => {
            const r = d.request;
            return (
              <>
                <T v="title" style={{ fontSize: 22 }}>{r.subject}</T>
                <Pills style={{ marginTop: 8 }}>
                  <LabelPill label={r.status} />
                  <LabelPill label={r.kind} />
                  {!r.closed ? <SlaPill sla={r.sla} /> : null}
                </Pills>
                <Card style={{ marginTop: space.md }}>
                  <T selectable>{r.detail}</T>
                  <View style={{ marginTop: space.sm }}>
                    <Line label="Cliente" value={d.client.name} />
                    <Line label="Correo" value={d.client.email ?? '—'} />
                    <Line label="Cuenta" value={d.client.hasAccount ? 'Con cuenta en la app' : 'Sin cuenta en la app'} />
                    <Line label="Creada" value={fechaHora(r.createdAt)} />
                    <Line label="Responsable" value={r.assignee ? `${r.assignee.name}${r.assignedToMe ? ' (tú)' : ''}` : 'Sin asignar'} />
                  </View>
                  {can('person.read') ? <Button small variant="secondary" title="Abrir ficha del cliente" onPress={() => router.push(routes.cliente(d.client.id))} style={{ marginTop: space.md, alignSelf: 'flex-start' }} /> : null}
                </Card>
                {r.closed && r.resolution ? (
                  <View style={{ marginTop: space.md }}>
                    <Notice tone="info">{`Resolución: ${r.resolution}`}</Notice>
                  </View>
                ) : null}

                {!r.closed ? (
                  <Section title="Gestión">
                    <Card style={{ gap: space.md }}>
                      {!r.assignedToMe ? <Button small title="Tomar solicitud" onPress={() => run('/tomar')} loading={action.pending} /> : null}
                      <Select label="Responsable" value={r.assignee?.id ?? ''} options={[{ value: '', label: 'Sin asignar' }, ...d.options.staff.map((s) => ({ value: s.id, label: s.name, hint: s.roleLabel }))]} onChange={(v) => assign(d, v)} />
                      <Select label="Estado" value={r.status.code} options={d.options.statuses} onChange={(status) => run('/estado', { status })} />
                      <Button small variant="danger" title="Resolver o rechazar" onPress={() => resolve(d)} />
                    </Card>
                  </Section>
                ) : null}

                {d.scenario ? (
                  <Section title="Escenario adjunto del cliente">
                    <Card>
                      <T v="h3">{d.scenario.name}</T>
                      <T v="small">{`${d.scenario.kind} · ${fechaHora(d.scenario.createdAt)} · motor ${d.scenario.engineVersion} · entradas ${d.scenario.inputsHashPrefix}`}</T>
                      <ScenarioValues value={d.scenario.results} />
                    </Card>
                  </Section>
                ) : null}

                <Section title="Conversación">
                  {d.messages.length === 0 ? <Empty>Aún no hay mensajes.</Empty> : null}
                  {d.messages.map((m) => (
                    <View
                      key={m.id}
                      style={{
                        alignSelf: m.fromClient ? 'flex-start' : 'flex-end',
                        maxWidth: '88%',
                        padding: 12,
                        borderRadius: radius.md,
                        backgroundColor: m.internal ? colors.amberSoft : m.fromClient ? colors.white : colors.sky,
                        borderWidth: 1,
                        borderColor: m.internal ? '#f0ddb0' : colors.line,
                        borderStyle: m.internal ? 'dashed' : 'solid',
                      }}
                    >
                      <T v="small" style={{ fontFamily: fonts.semibold, color: colors.ink }}>{`${m.author.name}${m.author.roleLabel ? ` · ${m.author.roleLabel}` : ''}${m.internal ? ' · nota interna' : ''}`}</T>
                      <T style={{ marginTop: 2 }} selectable>{m.body}</T>
                      <T v="small" style={{ marginTop: 4, fontSize: 11.5 }}>{fechaHora(m.createdAt)}</T>
                    </View>
                  ))}
                </Section>

                <Section title={r.closed ? 'Nota interna' : 'Escribir'}>
                  {!r.closed ? (
                    <Segmented
                      value={mode}
                      onChange={(v) => setMode(v as 'reply' | 'internal')}
                      options={[
                        { value: 'reply', label: 'Respuesta al cliente' },
                        { value: 'internal', label: 'Nota interna' },
                      ]}
                    />
                  ) : (
                    <T v="small">La solicitud está cerrada: solo se admiten notas internas.</T>
                  )}
                  <Field label={r.closed || mode === 'internal' ? 'Nota interna (no la ve el cliente)' : 'Respuesta (la verá el cliente)'} value={body} onChangeText={setBody} multiline maxLength={4000} />
                  <Button title={r.closed || mode === 'internal' ? 'Guardar nota interna' : 'Enviar al cliente'} icon={<Send size={17} color={colors.navy} />} onPress={() => send(r.closed)} loading={action.pending} disabled={body.trim().length < 2} />
                </Section>
              </>
            );
          }}
        </Loadable>
      </Page>
    </>
  );
}

/** Muestra los resultados guardados del escenario del cliente como pares legibles. */
function ScenarioValues({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v));
  if (!entries.length) return null;
  return (
    <View style={{ marginTop: space.sm }}>
      {entries.slice(0, 14).map(([k, v]) => (
        <Line key={k} label={k} value={typeof v === 'number' ? decimal(v, Number.isInteger(v) ? 0 : 2) : String(v ?? '—')} />
      ))}
    </View>
  );
}
