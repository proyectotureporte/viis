import { Check, ChevronDown, ChevronRight, Info, TriangleAlert, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { milesInput } from '@/services/format';
import { colors, fonts, radius, space, toneColors, type Tone } from './theme';

// ── Texto ─────────────────────────────────────────────────────────────────

type TextVariant = 'title' | 'h2' | 'h3' | 'body' | 'small' | 'eyebrow' | 'big' | 'muted';

const textStyles: Record<TextVariant, TextStyle> = {
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 31, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.ink },
  h3: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 21, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  muted: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11.5, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.muted },
  big: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, color: colors.ink, letterSpacing: -0.4 },
};

export function T({ v = 'body', style, children, ...rest }: { v?: TextVariant; style?: StyleProp<TextStyle>; children: React.ReactNode; numberOfLines?: number; selectable?: boolean }) {
  return (
    <Text style={[textStyles[v], style]} {...rest}>
      {children}
    </Text>
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────

export function Screen({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh,
  right,
  scroll = true,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  right?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const header = title ? (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <T v="title">{title}</T>
        {subtitle ? <T v="muted" style={{ marginTop: 4 }}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  ) : null;
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[padded && s.content]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.mint} /> : undefined}
          >
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padded && s.content]}>
            {header}
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={colors.mint} size="large" />
      <T v="muted" style={{ marginTop: 10 }}>{label}</T>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[s.center, { paddingHorizontal: 24 }]}>
      <TriangleAlert color={colors.danger} size={30} />
      <T style={{ textAlign: 'center', marginTop: 10 }}>{message}</T>
      {onRetry ? <Button title="Reintentar" variant="secondary" onPress={onRetry} style={{ marginTop: 14 }} /> : null}
    </View>
  );
}

// ── Contenedores ─────────────────────────────────────────────────────────

export function Card({ children, style, dark, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean; onPress?: () => void }) {
  const body = <View style={[s.card, dark && s.cardDark, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={s.sectionHead}>
        <T v="h2">{title}</T>
        {right}
      </View>
      <View style={{ gap: space.md }}>{children}</View>
    </View>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'positive' | 'negative' }) {
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <T v="eyebrow">{label}</T>
      <T v="big" style={{ marginTop: 6, fontSize: 24, lineHeight: 29 }}>{value}</T>
      {sub ? <T v="small" style={tone === 'positive' ? { color: colors.mintDeep, fontFamily: fonts.semibold } : tone === 'negative' ? { color: colors.danger, fontFamily: fonts.semibold } : undefined}>{sub}</T> : null}
    </Card>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>{children}</View>;
}

export function Row({ title, subtitle, right, onPress, dot }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; dot?: Tone }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.mist }]}>
      {dot ? <View style={[s.dot, { backgroundColor: dot === 'ok' ? colors.mint : toneColors[dot].fg }]} /> : null}
      <View style={{ flex: 1 }}>
        <T v="h3">{title}</T>
        {subtitle ? <T v="small" style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {right}
      {onPress ? <ChevronRight size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

export function KeyValue({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <T v="small" style={{ flexShrink: 0 }}>{k}</T>
          {typeof v === 'string' || typeof v === 'number' ? <T v="h3" style={{ textAlign: 'right', flex: 1 }}>{v}</T> : v}
        </View>
      ))}
    </View>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────

export function Pill({ tone = 'ok', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <View style={[s.pill, { backgroundColor: toneColors[tone].bg }]}>
      <Text style={{ color: toneColors[tone].fg, fontFamily: fonts.semibold, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <T v="muted" style={{ textAlign: 'center' }}>{children}</T>
    </View>
  );
}

export function Notice({ tone = 'wait', children }: { tone?: 'wait' | 'info' | 'bad'; children: React.ReactNode }) {
  const palette = tone === 'info' ? { bg: colors.sky, fg: '#0f5157', border: '#c5e6e9' } : tone === 'bad' ? { bg: colors.dangerSoft, fg: '#8a2a2a', border: '#f2c4c4' } : { bg: '#fff8e8', fg: '#6d4f15', border: '#f0ddb0' };
  return (
    <View style={[s.notice, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {tone === 'info' ? <Info size={18} color={palette.fg} /> : <TriangleAlert size={18} color={palette.fg} />}
      <Text style={{ flex: 1, color: palette.fg, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

/** Nivel de confianza del dato: ningún valor material sin fuente ni fecha. */
export function Confidence({ level, source, asOf }: { level: string; source?: string | null; asOf?: string | null }) {
  const tone: Tone = level === 'CONFIRMED' ? 'ok' : level === 'ESTIMATED' ? 'info' : 'wait';
  const label = level === 'CONFIRMED' ? 'Confirmado' : level === 'ESTIMATED' ? 'Estimado' : 'Declarado';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <Pill tone={tone}>{label}</Pill>
      {source ? <T v="small">{source}</T> : null}
      {asOf ? <T v="small">· {asOf}</T> : null}
    </View>
  );
}

export function ResultBanner({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <View style={[s.result, { backgroundColor: result.ok ? colors.okSoft : colors.dangerSoft }]} accessibilityLiveRegion="polite">
      {result.ok ? <Check size={18} color="#08755f" /> : <X size={18} color={colors.danger} />}
      <Text style={{ flex: 1, color: result.ok ? '#08755f' : colors.danger, fontFamily: fonts.medium, fontSize: 14 }}>{result.message}</Text>
    </View>
  );
}

export function Progress({ value, color = colors.mint }: { value: number; color?: string }) {
  return (
    <View style={s.bar}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color, height: '100%', borderRadius: 99 }} />
    </View>
  );
}

// ── Botones y campos ─────────────────────────────────────────────────────

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
  small?: boolean;
}) {
  const palette = {
    primary: { bg: colors.mint, fg: colors.navy, border: colors.mint },
    secondary: { bg: '#eef5f6', fg: colors.ink, border: colors.line },
    ghost: { bg: 'transparent', fg: colors.white, border: 'rgba(255,255,255,0.6)' },
    danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
    light: { bg: colors.white, fg: colors.navy, border: colors.white },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        small && { minHeight: 38, paddingHorizontal: 12 },
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon}
      <Text style={{ color: palette.fg, fontFamily: fonts.bold, fontSize: small ? 14 : 15.5 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={[{ gap: 6 }, style as StyleProp<ViewStyle>]}>
      <T v="small" style={{ fontFamily: fonts.semibold, color: colors.muted }}>{label}</T>
      <TextInput placeholderTextColor="#8b9aa1" {...props} style={[s.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, error && { borderColor: colors.danger }]} accessibilityLabel={label} />
      {hint ? <T v="small">{hint}</T> : null}
      {error ? <T v="small" style={{ color: colors.danger }}>{error}</T> : null}
    </View>
  );
}

/** Campo de pesos: muestra "4.500.000" y entrega el texto; usa soloDigitos() al enviar. */
export function MoneyField({ value, onChangeText, ...props }: Omit<React.ComponentProps<typeof Field>, 'keyboardType'>) {
  return <Field {...props} value={value} keyboardType="number-pad" onChangeText={(t) => onChangeText?.(milesInput(t))} />;
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export function Select({ label, value, options, onChange, placeholder = 'Elige…' }: { label: string; value: string | null | undefined; options: Option[]; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      <T v="small" style={{ fontFamily: fonts.semibold, color: colors.muted }}>{label}</T>
      <Pressable style={[s.input, s.select]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}>
        <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: current ? colors.ink : '#8b9aa1' }} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <SafeAreaView style={s.sheet} edges={['bottom']}>
          <View style={s.sheetHead}>
            <T v="h2">{label}</T>
            <Pressable onPress={() => setOpen(false)} accessibilityLabel="Cerrar"><X size={22} color={colors.ink} /></Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            renderItem={({ item }) => (
              <Pressable style={[s.option, item.value === value && { backgroundColor: colors.sky }]} onPress={() => { onChange(item.value); setOpen(false); }}>
                <View style={{ flex: 1 }}>
                  <T>{item.label}</T>
                  {item.hint ? <T v="small">{item.hint}</T> : null}
                </View>
                {item.value === value ? <Check size={18} color={colors.mintDeep} /> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Pressable style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }} onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[s.check, checked && { backgroundColor: colors.mintDeep, borderColor: colors.mintDeep }]}>{checked ? <Check size={14} color="#fff" /> : null}</View>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <T v="body" style={{ fontSize: 14 }}>{children}</T> : children}</View>
    </Pressable>
  );
}

export function Segmented({ value, options, onChange }: { value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segment, o.value === value && s.segmentOn]} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }}>
          <Text style={{ fontFamily: o.value === value ? fonts.bold : fonts.medium, color: o.value === value ? colors.white : colors.ink, fontSize: 14 }}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 240 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg },
  cardDark: { backgroundColor: colors.navy, borderColor: colors.navy },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  empty: { padding: 24, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.mist },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  result: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: radius.md },
  bar: { height: 9, backgroundColor: '#e8eef0', borderRadius: 99, overflow: 'hidden', marginVertical: 10 },
  button: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#c3d2d7', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  select: { flexDirection: 'row', alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(12,43,59,0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg, borderBottomWidth: 1, borderColor: colors.line },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.mist },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#9aacb3', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  segment: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  segmentOn: { backgroundColor: colors.navy, borderColor: colors.navy },
});
