import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LabelView, PageInfo, SlaView } from '@/lib/movil/contract-empresa';
import { ErrorState, Loading, Pill, ResultBanner, T } from '@/ui/kit';
import { colors, fonts, radius, space, type Tone } from '@/ui/theme';
import { HeaderActions } from './HeaderActions';

// ── Página ───────────────────────────────────────────────────────────────

/**
 * Contenedor de pantalla de la consola. `tab` = pantalla raíz de una pestaña
 * (respeta la muesca y muestra campana + avatar); sin `tab` vive bajo el
 * encabezado nativo de la pila.
 */
export function Page({
  title,
  subtitle,
  tab,
  right,
  children,
  refreshing,
  onRefresh,
  footer,
  busy,
}: {
  title?: string;
  subtitle?: string | null;
  tab?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: React.ReactNode;
  busy?: boolean;
}) {
  const body = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={tab ? 0 : 90}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.mint} colors={[colors.mintDeep]} /> : undefined}
      >
        {title || tab ? (
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              {title ? <T v="title">{title}</T> : null}
              {subtitle ? <T v="muted" style={{ marginTop: 4 }}>{subtitle}</T> : null}
            </View>
            {right}
            {tab ? <HeaderActions /> : null}
          </View>
        ) : right ? (
          <View style={[s.header, { justifyContent: 'flex-end' }]}>{right}</View>
        ) : null}
        {busy ? (
          <View style={s.busy} accessibilityLabel="Actualizando">
            <ActivityIndicator size="small" color={colors.mintDeep} />
            <T v="small">Actualizando…</T>
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
  return tab ? (
    <SafeAreaView style={s.safe} edges={['top']}>
      {body}
    </SafeAreaView>
  ) : (
    <View style={s.safe}>{body}</View>
  );
}

/** Estados de carga / error con reintento para una consulta de `useLoad`. */
export function Loadable<T>({ q, children, label }: { q: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (data: T) => React.ReactNode; label?: string }) {
  if (q.data) return <>{children(q.data)}</>;
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  return <Loading label={label} />;
}

// ── Etiquetas ────────────────────────────────────────────────────────────

export function LabelPill({ label, prefix }: { label: LabelView | null | undefined; prefix?: string }) {
  if (!label) return null;
  return <Pill tone={label.tone as Tone}>{prefix ? `${prefix} ${label.label}` : label.label}</Pill>;
}

export function SlaPill({ sla }: { sla: SlaView | null | undefined }) {
  if (!sla || !sla.dueAt) return null;
  return <Pill tone={sla.tone as Tone}>{`SLA ${sla.text}`}</Pill>;
}

export function Pills({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, style]}>{children}</View>;
}

export function Count({ n, tone = 'bad' }: { n: number | null | undefined; tone?: 'bad' | 'info' }) {
  if (!n) return null;
  return (
    <View style={[s.count, { backgroundColor: tone === 'bad' ? colors.danger : colors.info }]}>
      <Text style={s.countText}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

// ── Filtros y navegación ─────────────────────────────────────────────────

export function Chip({ label, active, onPress, count }: { label: string; active: boolean; onPress: () => void; count?: number | null }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={count ? `${label}, ${count}` : label}>
      <Text style={{ fontFamily: active ? fonts.bold : fonts.medium, color: active ? colors.white : colors.ink, fontSize: 13.5 }}>{label}</Text>
      {count ? (
        <View style={[s.chipCount, active && { backgroundColor: colors.mint }]}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: active ? colors.navy : colors.white }}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: space.md, flexGrow: 0 }}>
      {children}
    </ScrollView>
  );
}

export function Pager({ page, onChange }: { page: PageInfo | null | undefined; onChange: (page: number) => void }) {
  if (!page || page.pages <= 1) return page ? <T v="small" style={{ textAlign: 'center', marginTop: space.md }}>{`${page.total} ${page.total === 1 ? 'registro' : 'registros'}`}</T> : null;
  return (
    <View style={s.pager}>
      <Pressable disabled={page.page <= 1} onPress={() => onChange(page.page - 1)} style={[s.pageBtn, page.page <= 1 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Página anterior">
        <ChevronLeft size={18} color={colors.ink} />
      </Pressable>
      <T v="small" style={{ fontFamily: fonts.semibold, color: colors.ink }}>{`Página ${page.page} de ${page.pages} · ${page.total} registros`}</T>
      <Pressable disabled={page.page >= page.pages} onPress={() => onChange(page.page + 1)} style={[s.pageBtn, page.page >= page.pages && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Página siguiente">
        <ChevronRight size={18} color={colors.ink} />
      </Pressable>
    </View>
  );
}

// ── Gráficos nativos (sin librerías) ─────────────────────────────────────

export interface BarItem {
  label: string;
  value: number;
  display?: string;
  sub?: string;
  color?: string;
}

/** Barras horizontales proporcionales al máximo (o a `max`). */
export function Bars({ items, max, color = colors.mint }: { items: BarItem[]; max?: number; color?: string }) {
  const top = Math.max(max ?? 0, ...items.map((i) => i.value), 1);
  return (
    <View style={{ gap: 12 }}>
      {items.map((i) => (
        <View key={i.label} accessible accessibilityLabel={`${i.label}: ${i.display ?? i.value}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T v="small" style={{ color: colors.ink, flex: 1 }} numberOfLines={1}>{i.label}</T>
            <T v="small" style={{ fontFamily: fonts.semibold, color: colors.ink }}>{i.display ?? String(i.value)}</T>
          </View>
          <View style={s.track}>
            <View style={{ width: `${Math.max(i.value > 0 ? 2 : 0, (i.value / top) * 100)}%`, height: '100%', backgroundColor: i.color ?? color, borderRadius: 99 }} />
          </View>
          {i.sub ? <T v="small" style={{ fontSize: 12 }}>{i.sub}</T> : null}
        </View>
      ))}
    </View>
  );
}

/** Embudo: barras centradas decrecientes. */
export function Funnel({ items }: { items: BarItem[] }) {
  const top = Math.max(...items.map((i) => i.value), 1);
  return (
    <View style={{ gap: 6 }}>
      {items.map((i, idx) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`${i.label}: ${i.display ?? i.value}`}>
          <T v="small" style={{ width: 104, color: colors.ink }} numberOfLines={1}>{i.label}</T>
          <View style={{ flex: 1, height: 22, justifyContent: 'center' }}>
            <View style={{ width: `${Math.max(i.value > 0 ? 3 : 0, (i.value / top) * 100)}%`, height: 22, borderRadius: 6, backgroundColor: colors.navy2, opacity: 0.45 + 0.55 * (1 - idx / Math.max(items.length, 2)) }} />
          </View>
          <T v="small" style={{ width: 44, textAlign: 'right', fontFamily: fonts.semibold, color: colors.ink }}>{i.display ?? String(i.value)}</T>
        </View>
      ))}
    </View>
  );
}

/** Cifra compacta dentro de una tarjeta de 2 columnas. */
export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string | null; tone?: 'bad' | 'ok' | 'wait' }) {
  const fg = tone === 'bad' ? colors.danger : tone === 'ok' ? colors.mintDeep : tone === 'wait' ? colors.amber : colors.ink;
  return (
    <View style={s.stat}>
      <T v="eyebrow" numberOfLines={2}>{label}</T>
      <T v="big" style={{ fontSize: 22, lineHeight: 27, marginTop: 4, color: fg }}>{value}</T>
      {sub ? <T v="small" style={{ fontSize: 12 }}>{sub}</T> : null}
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
}

// ── Hoja inferior (formularios largos, filtros) ──────────────────────────

export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <SafeAreaView style={s.sheet} edges={['bottom']}>
          <View style={s.sheetHead}>
            <T v="h2" style={{ flex: 1 }}>{title}</T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Varios ───────────────────────────────────────────────────────────────

/** Mensaje del servidor fijo al pie (visible aunque la acción esté al final de la pantalla). */
export function ResultFooter({ result, onClose }: { result: { ok: boolean; message: string } | null; onClose: () => void }) {
  if (!result) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flex: 1 }}>
        <ResultBanner result={result} />
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar mensaje" hitSlop={10}>
        <X size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export function Actions({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space.md }} />;
}

export function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
      <T v="small" style={{ flexShrink: 0, maxWidth: '48%' }}>{label}</T>
      {typeof value === 'string' || typeof value === 'number' ? (
        <T v="body" style={{ textAlign: 'right', flex: 1, fontSize: 14, fontFamily: strong ? fonts.bold : fonts.medium }}>{String(value)}</T>
      ) : (
        <View style={{ flex: 1, alignItems: 'flex-end' }}>{value}</View>
      )}
    </View>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <T v="small" style={{ marginTop: 4 }}>{children}</T>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 56 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: space.lg },
  busy: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: space.sm },
  footer: { padding: space.md, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  count: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countText: { color: colors.white, fontFamily: fonts.bold, fontSize: 11 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, gap: 8 },
  pageBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  track: { height: 10, backgroundColor: '#e8eef0', borderRadius: 99, overflow: 'hidden', marginTop: 5 },
  stat: { flexGrow: 1, flexBasis: '46%', backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(12,43,59,0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderColor: colors.line },
  sheetFooter: { padding: space.md, borderTopWidth: 1, borderColor: colors.line },
});

