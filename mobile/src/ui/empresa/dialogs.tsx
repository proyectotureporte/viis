import { X } from 'lucide-react-native';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hoyIso } from '@/services/format';
import { Button, Checkbox, Field, MoneyField, Notice, Select, T, type Option } from '@/ui/kit';
import { DateField } from '@/ui/DateField';
import { colors, space } from '@/ui/theme';

/**
 * Confirmaciones y formularios cortos en una hoja inferior (funciona igual en
 * iOS, Android y web). Toda acción destructiva o sensible pasa por aquí.
 */

export interface DialogField {
  name: string;
  label: string;
  /** `check` devuelve 'on' (marcada) o '' (sin marcar). */
  kind?: 'text' | 'multiline' | 'money' | 'date' | 'select' | 'number' | 'email' | 'check';
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  hint?: string;
  options?: Option[];
  initial?: string;
  maxLength?: number;
}

export interface DialogOptions {
  title: string;
  message?: string;
  /** Aviso destacado (p. ej. "queda en la bitácora"). */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  fields?: DialogField[];
}

type Values = Record<string, string>;

interface DialogValue {
  /** Pide confirmación; true si la persona confirma. */
  confirm(opts: DialogOptions): Promise<boolean>;
  /** Pide datos; devuelve los valores o null si se cancela. */
  ask(opts: DialogOptions & { fields: DialogField[] }): Promise<Values | null>;
}

const Ctx = createContext<DialogValue | null>(null);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validate(fields: DialogField[], values: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.name] ?? '').trim();
    if (f.required && !v) errors[f.name] = 'Este dato es obligatorio.';
    else if (v && f.minLength && v.length < f.minLength) errors[f.name] = `Escribe al menos ${f.minLength} caracteres.`;
    else if (v && f.kind === 'date' && !DATE_RE.test(v)) errors[f.name] = 'Usa el formato AAAA-MM-DD.';
  }
  return errors;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<DialogOptions | null>(null);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const resolver = useRef<((v: Values | null) => void) | null>(null);

  const open = useCallback((opts: DialogOptions) => {
    return new Promise<Values | null>((resolve) => {
      resolver.current?.(null);
      resolver.current = resolve;
      const init: Values = {};
      for (const f of opts.fields ?? []) init[f.name] = f.initial ?? (f.kind === 'date' && f.required ? hoyIso() : '');
      setValues(init);
      setErrors({});
      setCurrent(opts);
    });
  }, []);

  const close = useCallback((result: Values | null) => {
    resolver.current?.(result);
    resolver.current = null;
    setCurrent(null);
  }, []);

  const value = useMemo<DialogValue>(
    () => ({
      confirm: async (opts) => (await open({ ...opts, fields: [] })) !== null,
      ask: (opts) => open(opts),
    }),
    [open],
  );

  function submit() {
    const fields = current?.fields ?? [];
    const errs = validate(fields, values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const out: Values = {};
    for (const f of fields) out[f.name] = (values[f.name] ?? '').trim();
    close(out);
  }

  const set = (name: string) => (text: string) => setValues((v) => ({ ...v, [name]: text }));

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal visible={Boolean(current)} transparent animationType="fade" onRequestClose={() => close(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.backdrop} onPress={() => close(null)} accessibilityLabel="Cerrar" />
          {current ? (
            <SafeAreaView style={s.sheet} edges={['bottom']}>
              <View style={s.head}>
                <T v="h2" style={{ flex: 1 }}>{current.title}</T>
                <Pressable onPress={() => close(null)} accessibilityRole="button" accessibilityLabel="Cancelar" hitSlop={8}>
                  <X size={22} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
                {current.message ? <T v="muted">{current.message}</T> : null}
                {current.warning ? <Notice tone="wait">{current.warning}</Notice> : null}
                {(current.fields ?? []).map((f) => {
                  const common = { label: f.required ? f.label : `${f.label} (opcional)`, value: values[f.name] ?? '', onChangeText: set(f.name), placeholder: f.placeholder, hint: f.hint, error: errors[f.name], maxLength: f.maxLength };
                  if (f.kind === 'select')
                    return (
                      <View key={f.name} style={{ gap: 4 }}>
                        <Select label={common.label} value={values[f.name]} options={f.options ?? []} onChange={set(f.name)} />
                        {errors[f.name] ? <T v="small" style={{ color: colors.danger }}>{errors[f.name]}</T> : null}
                      </View>
                    );
                  if (f.kind === 'money') return <MoneyField key={f.name} {...common} />;
                  if (f.kind === 'date')
                    return <DateField key={f.name} label={f.label} value={values[f.name] ?? ''} onChange={set(f.name)} optional={!f.required} error={errors[f.name]} shortcuts={[{ label: 'Hoy', value: hoyIso() }]} />;
                  if (f.kind === 'check')
                    return (
                      <Checkbox key={f.name} checked={values[f.name] === 'on'} onChange={(v) => set(f.name)(v ? 'on' : '')}>
                        {f.label}
                      </Checkbox>
                    );
                  return (
                    <Field
                      key={f.name}
                      {...common}
                      multiline={f.kind === 'multiline'}
                      keyboardType={f.kind === 'number' ? 'decimal-pad' : f.kind === 'email' ? 'email-address' : 'default'}
                      autoCapitalize={f.kind === 'email' ? 'none' : 'sentences'}
                      placeholder={f.placeholder}
                    />
                  );
                })}
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                  <Button title={current.cancelLabel ?? 'Cancelar'} variant="secondary" onPress={() => close(null)} style={{ flex: 1 }} />
                  <Button title={current.confirmLabel ?? 'Confirmar'} variant={current.destructive ? 'danger' : 'primary'} onPress={submit} style={{ flex: 1 }} />
                </View>
              </ScrollView>
            </SafeAreaView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </Ctx.Provider>
  );
}

export function useDialog(): DialogValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDialog fuera de DialogProvider');
  return v;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,43,59,0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderColor: colors.line },
});
