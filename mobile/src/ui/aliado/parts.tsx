import type { ActionResult, AllyCaseRow, CodeLabel, SlaView, TaskView } from '@/lib/movil/contract';
import { router } from 'expo-router';
import { CalendarPlus, Check, CircleCheck, Clock3, Phone, RotateCcw, Users, X, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAction } from '@/services/hooks';
import { pesosCortos } from '@/services/format';
import { Button, Empty, Field, Pill, ResultBanner, Segmented, Select, T } from '@/ui/kit';
import { DateField, TimeField } from '@/ui/DateField';
import { colors, fonts, radius, space, type Tone } from '@/ui/theme';
import { downloadAndShare, DownloadError } from './files';
import { addDaysIso, bogotaDay, bogotaHHMM, diaCorto, horaCorta, proximaMediaHora } from './time';

// ── Navegación ───────────────────────────────────────────────────────────

export function goToCase(id: string) {
  router.push({ pathname: '/(aliado)/clientes/[id]', params: { id } });
}

export function toneOf(tone: string | null | undefined): Tone {
  return tone === 'ok' || tone === 'wait' || tone === 'bad' || tone === 'gray' || tone === 'info' ? tone : 'gray';
}

// ── Hoja inferior ────────────────────────────────────────────────────────

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <SafeAreaView style={s.sheet} edges={['bottom']}>
          <View style={s.sheetHead}>
            <T v="h2" style={{ flex: 1 }}>{title}</T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={10}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Confirmación dentro de la app (Alert con botones no existe en web). */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  danger,
  pending,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <T>{message}</T>
      <Button title={confirmLabel} variant={danger ? 'danger' : 'primary'} loading={pending} onPress={onConfirm} />
      <Button title="Volver" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────

export function SlaPill({ sla }: { sla: SlaView | null }) {
  if (!sla) return null;
  return <Pill tone={sla.tone}>{sla.overdue ? sla.text : `SLA ${sla.text}`}</Pill>;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected }}>
      <Text style={{ fontFamily: selected ? fonts.bold : fonts.medium, color: selected ? colors.white : colors.ink, fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

/** Fila de caso para listas (clientes, embudo). */
export function CaseCard({ item, onPress, note }: { item: Pick<AllyCaseRow, 'id' | 'code' | 'clientName' | 'productLabel' | 'sla' | 'amount' | 'disbursedAmount' | 'allyName'> & Partial<AllyCaseRow> & { daysInStage?: number }; onPress?: () => void; note?: string }) {
  const missing = item.missingDocuments ?? [];
  return (
    <Pressable onPress={onPress ?? (() => goToCase(item.id))} style={({ pressed }) => [s.case, pressed && { backgroundColor: colors.mist }]} accessibilityRole="button" accessibilityLabel={`${item.clientName}, ${item.code}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={1}>{item.clientName}</T>
          <T v="small" numberOfLines={1}>
            {item.code}
            {item.document ? ` · ${item.document}` : ''} · {item.productLabel}
          </T>
        </View>
        {item.stageLabel ? <Pill tone={toneOf(item.stageTone)}>{item.stageLabel}</Pill> : null}
      </View>
      <View style={s.caseMeta}>
        <SlaPill sla={item.sla} />
        {missing.length ? <Pill tone="wait">{missing.length === 1 ? 'Falta 1 documento' : `Faltan ${missing.length} documentos`}</Pill> : null}
        {item.disbursedAmount ? <Pill tone="ok">Desembolsado {pesosCortos(item.disbursedAmount)}</Pill> : item.amount ? <Pill tone="gray">{pesosCortos(item.amount)}</Pill> : null}
        {typeof item.daysInStage === 'number' ? <Pill tone="gray">{item.daysInStage === 0 ? 'Hoy en la etapa' : `${item.daysInStage} d en la etapa`}</Pill> : null}
      </View>
      {item.nextAction ? <T v="small" numberOfLines={2}>Siguiente paso: {item.nextAction}</T> : null}
      {note ? <T v="small" numberOfLines={3}>{note}</T> : null}
      {item.allyName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Users size={13} color={colors.muted} />
          <T v="small">{item.allyName}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Fecha y hora (accesos rápidos + calendario y reloj nativos; hora de Bogotá) ──

export function DateTimeChooser({ date, time, onChange, days = 14 }: { date: string; time: string; onChange: (v: { date: string; time: string }) => void; days?: number }) {
  const today = bogotaDay(new Date().toISOString());
  const options = Array.from({ length: days }, (_, i) => addDaysIso(today, i));
  return (
    <View style={{ gap: 8 }}>
      <T v="small" style={{ fontFamily: fonts.semibold }}>Día</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {options.map((d) => (
          <Chip key={d} selected={d === date} label={d === today ? 'Hoy' : d === addDaysIso(today, 1) ? 'Mañana' : diaCorto(d)} onPress={() => onChange({ date: d, time })} />
        ))}
      </ScrollView>
      <DateField label="O elige otra fecha" value={date} min={today} onChange={(d) => d && onChange({ date: d, time })} />
      <TimeField label="Hora (Bogotá)" value={time} onChange={(t) => onChange({ date, time: t })} />
    </View>
  );
}

// ── Tareas ───────────────────────────────────────────────────────────────

const KIND_ICON: Record<string, typeof Clock3> = { LLAMADA: Phone, CITA: Users, TAREA: CircleCheck };

export function TaskForm({
  kinds,
  opportunityId,
  caseOptions,
  onSaved,
}: {
  kinds: CodeLabel[];
  opportunityId?: string;
  caseOptions?: { id: string; code: string; clientName: string }[];
  onSaved: (result: ActionResult) => void;
}) {
  const start = proximaMediaHora();
  const [kind, setKind] = useState(kinds[0]?.code ?? 'LLAMADA');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(start);
  const [detail, setDetail] = useState('');
  const [caseId, setCaseId] = useState('');
  const { run, pending, result } = useAction();

  async function submit() {
    const res = await run('/aliado/agenda', { kind, title: title.trim(), date: when.date, time: when.time, detail: detail.trim() || undefined, opportunityId: opportunityId ?? (caseId || undefined) });
    if (res.ok) onSaved(res);
  }

  return (
    <View style={{ gap: space.md }}>
      <Segmented value={kind} options={kinds.map((k) => ({ value: k.code, label: k.label }))} onChange={setKind} />
      <Field label="Título" value={title} onChangeText={setTitle} placeholder={kind === 'LLAMADA' ? 'Llamar para confirmar documentos' : kind === 'CITA' ? 'Visita para firma de autorizaciones' : 'Revisar certificado laboral'} maxLength={200} />
      <DateTimeChooser date={when.date} time={when.time} onChange={setWhen} />
      {!opportunityId && caseOptions ? (
        <Select
          label="Caso (opcional)"
          value={caseId}
          onChange={setCaseId}
          options={[{ value: '', label: 'Sin caso vinculado' }, ...caseOptions.map((c) => ({ value: c.id, label: `${c.clientName} · ${c.code}` }))]}
        />
      ) : null}
      <Field label="Detalle (opcional)" value={detail} onChangeText={setDetail} multiline maxLength={2000} />
      <ResultBanner result={result && !result.ok ? result : null} />
      <Button title="Agendar" onPress={submit} loading={pending} disabled={title.trim().length < 3} />
    </View>
  );
}

/**
 * Lista de actividades con sus acciones (completar, reprogramar, cancelar,
 * agregar al calendario). Muestra el mensaje del servidor arriba de la lista.
 */
export function TaskList({
  tasks,
  onChanged,
  onResult,
  empty,
  showCase = true,
}: {
  tasks: TaskView[];
  onChanged: () => void;
  /** Si se da, el mensaje del servidor lo muestra el padre (la tarea puede cambiar de sección). */
  onResult?: (result: { ok: boolean; message: string } | null) => void;
  empty?: string;
  showCase?: boolean;
}) {
  const { run, pending, result, clear } = useAction();
  const [ownBanner, setOwnBanner] = useState<{ ok: boolean; message: string } | null>(null);
  const setBanner = (value: { ok: boolean; message: string } | null) => (onResult ? onResult(value) : setOwnBanner(value));
  const [reschedule, setReschedule] = useState<TaskView | null>(null);
  const [when, setWhen] = useState({ date: '', time: '' });
  const [cancel, setCancel] = useState<TaskView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [acting, setActing] = useState<string | null>(null);

  async function act(path: string, body?: Record<string, unknown>, key?: string) {
    setActing(key ?? null);
    const res = await run(path, body);
    setActing(null);
    setBanner(res);
    if (res.ok) {
      setReschedule(null);
      setCancel(null);
      onChanged();
    }
    return res;
  }

  async function calendar(task: TaskView) {
    setBusy(task.id);
    setBanner(null);
    try {
      await downloadAndShare(task.icsUrl, { fileName: `openv-${task.kind.toLowerCase()}-${task.id.slice(0, 8)}.ics`, mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle: 'Agregar al calendario' });
    } catch (error) {
      setBanner({ ok: false, message: error instanceof DownloadError ? error.message : 'No pudimos exportar la actividad.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <ResultBanner result={ownBanner} />
      {tasks.length === 0 && empty ? <Empty>{empty}</Empty> : null}
      {tasks.map((task) => {
        const Icon = KIND_ICON[task.kind] ?? Clock3;
        const closed = task.status !== 'OPEN';
        return (
          <View key={task.id} style={[s.task, closed && { opacity: 0.75 }]}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={[s.taskIcon, closed && { backgroundColor: '#edf1f2' }]}>
                <Icon size={17} color={closed ? colors.muted : colors.navy} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="h3" style={closed ? { textDecorationLine: 'line-through' } : undefined}>{task.title}</T>
                <T v="small">
                  {task.kindLabel} · {diaCorto(bogotaDay(task.dueAt))}, {horaCorta(task.dueAt)}
                  {task.assigneeName ? ` · ${task.assigneeName}` : ''}
                </T>
                {task.detail ? <T v="small" numberOfLines={3}>{task.detail}</T> : null}
                {task.status === 'DONE' ? <Pill tone="ok">Hecha</Pill> : task.status === 'CANCELLED' ? <Pill tone="gray">Cancelada</Pill> : null}
              </View>
            </View>
            {showCase && task.opportunity ? (
              <Pressable onPress={() => goToCase(task.opportunity!.id)} accessibilityRole="link">
                <Text style={s.link}>Caso {task.opportunity.code} ›</Text>
              </Pressable>
            ) : null}
            {task.editable ? (
              <View style={s.taskActions}>
                <Button small title="Hecha" icon={<Check size={16} color={colors.navy} />} onPress={() => act(`/aliado/agenda/${task.id}/completar`, undefined, `c${task.id}`)} loading={pending && acting === `c${task.id}`} />
                <Button
                  small
                  variant="secondary"
                  title="Reprogramar"
                  icon={<RotateCcw size={15} color={colors.ink} />}
                  onPress={() => {
                    clear();
                    setWhen({ date: bogotaDay(task.dueAt), time: bogotaHHMM(task.dueAt) });
                    setReschedule(task);
                  }}
                />
                <Button small variant="secondary" title="Calendario" icon={<CalendarPlus size={15} color={colors.ink} />} loading={busy === task.id} onPress={() => calendar(task)} />
                <Button small variant="secondary" title="Cancelar" icon={<XCircle size={15} color={colors.danger} />} onPress={() => { clear(); setCancel(task); }} />
              </View>
            ) : null}
          </View>
        );
      })}

      <Sheet visible={Boolean(reschedule)} title="Reprogramar" onClose={() => setReschedule(null)}>
        {reschedule ? <T v="muted">{reschedule.title}</T> : null}
        <DateTimeChooser date={when.date || bogotaDay(new Date().toISOString())} time={when.time || '09:00'} onChange={setWhen} />
        <ResultBanner result={result && !result.ok ? result : null} />
        <Button title="Guardar nueva fecha" loading={pending} onPress={() => reschedule && act(`/aliado/agenda/${reschedule.id}/reprogramar`, when)} />
      </Sheet>
      <ConfirmSheet
        visible={Boolean(cancel)}
        title="Cancelar actividad"
        message={cancel ? `¿Cancelar "${cancel.title}"? Queda registrada como cancelada en la bitácora.` : ''}
        confirmLabel="Cancelar actividad"
        danger
        pending={pending}
        onConfirm={() => cancel && act(`/aliado/agenda/${cancel.id}/cancelar`)}
        onClose={() => setCancel(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,43,59,0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  case: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  caseMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  task: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  taskIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' },
  taskActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { color: colors.blue, fontFamily: fonts.semibold, fontSize: 13.5 },
});

