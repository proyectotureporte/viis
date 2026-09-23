import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays, Clock, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fecha } from '@/services/format';
import { Button, Field, T } from './kit';
import { colors, fonts, radius, space } from './theme';

/**
 * Selectores de fecha y hora NATIVOS: calendario del sistema en Android y
 * hoja con calendario en línea en iOS. Los valores viajan como texto
 * `AAAA-MM-DD` / `HH:MM` (lo que espera la API). En web (solo pruebas) se
 * degrada a un campo de texto con guiones automáticos.
 */

const pad = (n: number) => String(n).padStart(2, '0');
export const toIsoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIsoDay = (v: string | null | undefined): Date | null => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return date.getMonth() === m - 1 ? date : null;
};
const autoDashes = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return d.length <= 4 ? d : d.length <= 6 ? `${d.slice(0, 4)}-${d.slice(4)}` : `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
};

interface Shortcut {
  label: string;
  value: string;
}

export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
  min,
  max,
  optional,
  shortcuts,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  /** Límites en AAAA-MM-DD. */
  min?: string;
  max?: string;
  /** Permite dejar la fecha vacía (muestra "Quitar"). */
  optional?: boolean;
  shortcuts?: Shortcut[];
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(new Date());
  const current = fromIsoDay(value);
  const minimumDate = fromIsoDay(min) ?? undefined;
  const maximumDate = fromIsoDay(max) ?? undefined;

  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 6 }}>
        <Field label={label} value={value} onChangeText={(t) => onChange(autoDashes(t))} placeholder="AAAA-MM-DD" keyboardType="number-pad" maxLength={10} hint={hint} error={error} />
        <Shortcuts items={shortcuts} label={label} onPick={onChange} />
      </View>
    );
  }

  function open() {
    const start = current ?? (maximumDate && maximumDate < new Date() ? maximumDate : new Date());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onChange(toIsoDay(date));
        },
      });
    } else {
      setDraft(start);
      setIosOpen(true);
    }
  }

  return (
    <View style={{ gap: 6 }}>
      <T v="small" style={s.label}>{label}</T>
      <Pressable onPress={open} style={[s.box, error ? { borderColor: colors.danger } : null]} accessibilityRole="button" accessibilityLabel={`${label}: ${current ? fecha(value) : 'sin fecha'}. Toca para elegir.`}>
        <CalendarDays size={19} color={colors.blue} />
        <Text style={[s.value, !current && { color: '#8b9aa1' }]}>{current ? fecha(value) : 'Elegir fecha'}</Text>
        {optional && current ? (
          <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Quitar ${label}`}>
            <X size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </Pressable>
      {hint ? <T v="small">{hint}</T> : null}
      {error ? <T v="small" style={{ color: colors.danger }}>{error}</T> : null}
      <Shortcuts items={shortcuts} label={label} onPick={onChange} />
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setIosOpen(false)} />
          <SafeAreaView edges={['bottom']} style={s.sheet}>
            <T v="h2" style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>{label}</T>
            <DateTimePicker value={draft} mode="date" display="inline" locale="es-CO" accentColor={colors.mintDeep} themeVariant="light" minimumDate={minimumDate} maximumDate={maximumDate} onChange={(_e, d) => d && setDraft(d)} />
            <View style={{ flexDirection: 'row', gap: 10, padding: space.lg }}>
              <Button title="Cancelar" variant="secondary" onPress={() => setIosOpen(false)} style={{ flex: 1 }} />
              <Button title="Listo" onPress={() => { onChange(toIsoDay(draft)); setIosOpen(false); }} style={{ flex: 1 }} />
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

export function TimeField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const valid = /^\d{2}:\d{2}$/.test(value);
  const asDate = () => {
    const d = new Date();
    if (valid) d.setHours(Number(value.slice(0, 2)), Number(value.slice(3)), 0, 0);
    return d;
  };
  const toHm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (Platform.OS === 'web') {
    return <Field label={label} value={value} onChangeText={onChange} placeholder="HH:MM" maxLength={5} error={error} />;
  }

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: asDate(), mode: 'time', is24Hour: false, onChange: (e, d) => e.type === 'set' && d && onChange(toHm(d)) });
    } else {
      setDraft(asDate());
      setIosOpen(true);
    }
  }
  const [h, m] = valid ? value.split(':').map(Number) : [0, 0];
  const text = valid ? `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}` : 'Elegir hora';

  return (
    <View style={{ gap: 6 }}>
      <T v="small" style={s.label}>{label}</T>
      <Pressable onPress={open} style={[s.box, error ? { borderColor: colors.danger } : null]} accessibilityRole="button" accessibilityLabel={`${label}: ${text}. Toca para elegir.`}>
        <Clock size={19} color={colors.blue} />
        <Text style={[s.value, !valid && { color: '#8b9aa1' }]}>{text}</Text>
      </Pressable>
      {error ? <T v="small" style={{ color: colors.danger }}>{error}</T> : null}
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setIosOpen(false)} />
          <SafeAreaView edges={['bottom']} style={s.sheet}>
            <T v="h2" style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>{label}</T>
            <DateTimePicker value={draft} mode="time" display="spinner" locale="es-CO" minuteInterval={5} themeVariant="light" onChange={(_e, d) => d && setDraft(d)} />
            <View style={{ flexDirection: 'row', gap: 10, padding: space.lg }}>
              <Button title="Cancelar" variant="secondary" onPress={() => setIosOpen(false)} style={{ flex: 1 }} />
              <Button title="Listo" onPress={() => { onChange(toHm(draft)); setIosOpen(false); }} style={{ flex: 1 }} />
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

function Shortcuts({ items, label, onPick }: { items?: Shortcut[]; label: string; onPick: (v: string) => void }) {
  if (!items?.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => (
        <Pressable key={item.label} onPress={() => onPick(item.value)} style={s.chip} accessibilityRole="button" accessibilityLabel={`${label}: ${item.label}`}>
          <Text style={s.chipText}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fonts.semibold, color: colors.muted },
  box: { minHeight: 48, borderWidth: 1, borderColor: '#c3d2d7', borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(12,43,59,0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: colors.sky, borderWidth: 1, borderColor: '#c5e6e9' },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: '#0f6e72' },
});
