import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { AuditEventView } from '@/lib/movil/contract-empresa';
import { fechaHora } from '@/services/format';
import { T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

/** Convierte un valor JSON en líneas "clave: valor" legibles (anidado con sangría). */
function lines(value: unknown, prefix = ''): { key: string; text: string }[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [{ key: prefix || 'valor', text: String(value) }];
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) return [{ key: prefix || 'lista', text: value.map(String).join(', ') || '—' }];
    return value.flatMap((v, i) => lines(v, `${prefix}[${i + 1}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') return lines(v, key);
    return [{ key, text: v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v) }];
  });
}

function Block({ title, value, tone }: { title: string; value: unknown; tone: 'before' | 'after' }) {
  const rows = lines(value);
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: space.sm, padding: space.sm, borderRadius: radius.sm, backgroundColor: tone === 'before' ? '#fbf1f1' : '#eef9f5' }}>
      <T v="eyebrow" style={{ color: tone === 'before' ? colors.danger : colors.mintDeep }}>{title}</T>
      {rows.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
          <T v="small" style={{ width: '42%', fontFamily: fonts.semibold, color: colors.ink }} selectable>{r.key}</T>
          <T v="small" style={{ flex: 1, color: colors.ink }} selectable>{r.text}</T>
        </View>
      ))}
    </View>
  );
}

/** Evento de la bitácora inmutable con su antes/después legible. */
export function AuditEventCard({ e, compact }: { e: AuditEventView; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetail = lines(e.before).length > 0 || lines(e.after).length > 0;
  return (
    <View style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md }}>
      <Pressable onPress={() => hasDetail && setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${e.action} ${fechaHora(e.at)}`} style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T v="h3" style={{ fontSize: 14.5 }} selectable>{e.action}</T>
          <T v="small">{`${fechaHora(e.at)} · ${e.actor.name}${e.actor.roleLabel ? ` (${e.actor.roleLabel})` : ''}`}</T>
          {!compact ? <T v="small" selectable>{`${e.entity}${e.entityId ? ` · ${e.entityId}` : ''} · canal ${e.channel} · #${e.id} · hash ${e.hashPrefix}`}</T> : null}
        </View>
        {hasDetail ? open ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} /> : null}
      </Pressable>
      {open ? (
        <>
          <Block title="Antes" value={e.before} tone="before" />
          <Block title="Después" value={e.after} tone="after" />
          {compact ? <T v="small" style={{ marginTop: 6 }} selectable>{`${e.entity} · #${e.id} · hash ${e.hashPrefix}`}</T> : null}
        </>
      ) : null}
    </View>
  );
}
