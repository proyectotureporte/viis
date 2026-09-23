import { CalendarPlus, MessageSquarePlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/services/auth';
import { fechaHora, hoyIso } from '@/services/format';
import { Button, Card, Checkbox, Empty, Field, Notice, Pill, Section, Select, T } from '@/ui/kit';
import { DateField, TimeField } from '@/ui/DateField';
import { colors, space } from '@/ui/theme';
import { useDialog } from '../dialogs';
import { LabelPill, Pills, Sheet } from '../ui';
import type { CasoCtx } from './types';

export function Actividad({ d, act, pending }: CasoCtx) {
  const { user } = useAuth();
  const dialog = useDialog();
  const [note, setNote] = useState<{ open: boolean; channel: string; summary: string; visible: boolean; error: string | null }>({ open: false, channel: 'LLAMADA', summary: '', visible: false, error: null });
  const [task, setTask] = useState({ open: false, title: '', kind: 'TAREA', assigneeId: '', date: hoyIso(), time: '17:00', detail: '', error: null as string | null });

  async function saveNote() {
    if (note.summary.trim().length < 3) return setNote({ ...note, error: 'Escribe el resumen de la interacción.' });
    const res = await act('/interacciones', { channel: note.channel, summary: note.summary.trim(), visibleToClient: note.visible || undefined });
    if (res.ok) setNote({ open: false, channel: 'LLAMADA', summary: '', visible: false, error: null });
    else setNote({ ...note, error: res.message });
  }

  async function saveTask() {
    if (task.title.trim().length < 3) return setTask({ ...task, error: 'Escribe el título de la tarea.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date) || !/^\d{2}:\d{2}$/.test(task.time)) return setTask({ ...task, error: 'Indica la fecha y la hora de vencimiento.' });
    const res = await act('/tareas', { title: task.title.trim(), kind: task.kind, assigneeId: task.assigneeId || user?.id, dueAt: `${task.date}T${task.time}`, detail: task.detail.trim() || undefined });
    if (res.ok) setTask({ open: false, title: '', kind: 'TAREA', assigneeId: '', date: hoyIso(), time: '17:00', detail: '', error: null });
    else setTask({ ...task, error: res.message });
  }

  async function closeTask(id: string, title: string, status: 'DONE' | 'CANCELLED') {
    const ok = await dialog.confirm({ title: status === 'DONE' ? 'Completar tarea' : 'Cancelar tarea', message: `“${title}”`, confirmLabel: status === 'DONE' ? 'Completar' : 'Cancelar tarea', cancelLabel: 'Volver', destructive: status === 'CANCELLED' });
    if (ok) await act(`/tareas/${id}`, { status });
  }

  const open = d.tasks.filter((t) => t.status === 'OPEN');
  const closed = d.tasks.filter((t) => t.status !== 'OPEN');

  return (
    <>
      <Section title="Tareas">
        {d.can.note ? <Button title="Nueva tarea" variant="secondary" icon={<CalendarPlus size={18} color={colors.ink} />} onPress={() => setTask({ ...task, open: true, assigneeId: d.options.staff.some((u) => u.id === user?.id) ? user!.id : '' })} /> : null}
        {d.tasks.length === 0 ? <Empty>Sin tareas en este caso.</Empty> : null}
        {[...open, ...closed].map((t) => (
          <Card key={t.id} style={t.status !== 'OPEN' ? { opacity: 0.7 } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <T v="h3" style={{ flex: 1 }}>{t.title}</T>
              <LabelPill label={t.kind} />
            </View>
            {t.detail ? <T v="small">{t.detail}</T> : null}
            <T v="small" style={{ color: t.overdue && t.status === 'OPEN' ? colors.danger : colors.muted }}>{`${t.assignee.name} · vence ${fechaHora(t.dueAt)}`}</T>
            <Pills style={{ marginTop: 6 }}>
              {t.status === 'OPEN' ? t.overdue ? <Pill tone="bad">Vencida</Pill> : <Pill tone="info">Abierta</Pill> : t.status === 'DONE' ? <Pill tone="ok">{`Completada ${fechaHora(t.doneAt)}`}</Pill> : <Pill tone="gray">Cancelada</Pill>}
            </Pills>
            {t.status === 'OPEN' && d.can.note ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
                <Button small title="Completar" onPress={() => closeTask(t.id, t.title, 'DONE')} style={{ flex: 1 }} />
                <Button small variant="secondary" title="Cancelar" onPress={() => closeTask(t.id, t.title, 'CANCELLED')} style={{ flex: 1 }} />
              </View>
            ) : null}
          </Card>
        ))}
      </Section>

      <Section title="Interacciones y notas">
        {d.can.note ? <Button title="Registrar interacción o nota" variant="secondary" icon={<MessageSquarePlus size={18} color={colors.ink} />} onPress={() => setNote({ ...note, open: true, error: null })} /> : null}
        {d.interactions.length === 0 ? <Empty>Sin interacciones registradas.</Empty> : null}
        {d.interactions.map((i) => (
          <Card key={i.id}>
            <Pills>
              <LabelPill label={i.channel} />
              {i.visibleToClient ? <Pill tone="ok">Visible al cliente</Pill> : <Pill tone="gray">Interna</Pill>}
            </Pills>
            <T style={{ marginTop: 6 }} selectable>{i.summary}</T>
            <T v="small" style={{ marginTop: 4 }}>{`${i.by} · ${fechaHora(i.createdAt)}`}</T>
          </Card>
        ))}
      </Section>

      <Sheet visible={note.open} title="Registrar interacción" onClose={() => setNote({ ...note, open: false })} footer={<Button title="Guardar" onPress={saveNote} loading={pending} />}>
        <Select label="Canal" value={note.channel} options={d.options.interactionChannels} onChange={(channel) => setNote({ ...note, channel })} />
        <Field label="Resumen" value={note.summary} onChangeText={(summary) => setNote({ ...note, summary })} multiline maxLength={4000} placeholder="Qué se habló, acuerdos y próximos pasos" />
        <Checkbox checked={note.visible} onChange={(visible) => setNote({ ...note, visible })}>
          Visible para el cliente: lo verá en su app y le llegará una notificación. Revisa que no incluya datos internos.
        </Checkbox>
        {note.error ? <Notice tone="bad">{note.error}</Notice> : null}
      </Sheet>

      <Sheet visible={task.open} title="Nueva tarea" onClose={() => setTask({ ...task, open: false })} footer={<Button title="Crear tarea" onPress={saveTask} loading={pending} />}>
        <Field label="Título" value={task.title} onChangeText={(title) => setTask({ ...task, title })} maxLength={200} />
        <Select label="Tipo" value={task.kind} options={d.options.taskKinds} onChange={(kind) => setTask({ ...task, kind })} />
        <Select label="Responsable" value={task.assigneeId} options={d.options.staff.map((u) => ({ value: u.id, label: u.name, hint: u.roleLabel }))} onChange={(assigneeId) => setTask({ ...task, assigneeId })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1.3 }}><DateField label="Fecha" value={task.date} onChange={(date) => setTask({ ...task, date })} /></View>
          <View style={{ flex: 1 }}><TimeField label="Hora" value={task.time} onChange={(time) => setTask({ ...task, time })} /></View>
        </View>
        <T v="small">Hora de Colombia.</T>
        <Field label="Detalle (opcional)" value={task.detail} onChangeText={(detail) => setTask({ ...task, detail })} multiline maxLength={2000} />
        {task.error ? <Notice tone="bad">{task.error}</Notice> : null}
      </Sheet>
    </>
  );
}
