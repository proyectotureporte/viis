import { router, type Href } from 'expo-router';
import { BellOff, CheckCheck } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import type { NotificacionesResponse, NotificationView } from '@/lib/movil/contract';
import { api } from '@/services/api';
import { useAuth } from '@/services/auth';
import { fechaHora } from '@/services/format';
import { useApi } from '@/services/hooks';
import { nativeRouteFor } from '@/ui/common/notificationRoutes';
import { Button, ErrorState, Loading, ResultBanner, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

/** Bandeja común a los tres portales. Tocar un aviso lo marca leído y abre la pantalla nativa equivalente. */
export default function Notificaciones() {
  const { user, refreshUser } = useAuth();
  const { data, error, loading, refreshing, refresh, reload, setData } = useApi<NotificacionesResponse>('/notificaciones');
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  function markLocal(ids: string[] | null) {
    if (!data) return;
    const now = new Date().toISOString();
    const items = data.items.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n));
    setData({ ...data, items, unread: items.filter((n) => !n.readAt).length });
  }

  async function markAll() {
    setMarking(true);
    setMarkError(null);
    try {
      await api.post('/notificaciones/leidas', {});
      markLocal(null);
      void refreshUser().catch(() => undefined);
    } catch {
      setMarkError('No pudimos marcar las notificaciones. Inténtalo de nuevo.');
    } finally {
      setMarking(false);
    }
  }

  async function openItem(n: NotificationView) {
    if (!n.readAt) {
      markLocal([n.id]);
      api.post('/notificaciones/leidas', { ids: [n.id] }).then(() => refreshUser()).catch(() => undefined);
    }
    const target = user ? nativeRouteFor(n.href, user.portal) : null;
    if (target) router.push(target as Href, { withAnchor: true });
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 48, gap: 10 }}
      data={data.items}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.mint} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <T v="muted">{data.unread ? `${data.unread} sin leer` : 'Estás al día'}</T>
            {data.unread ? <Button small variant="secondary" title="Marcar todas como leídas" icon={<CheckCheck size={16} color={colors.ink} />} onPress={markAll} loading={marking} /> : null}
          </View>
          <ResultBanner result={markError ? { ok: false, message: markError } : null} />
        </View>
      }
      ListEmptyComponent={
        <View style={s.empty}>
          <BellOff size={28} color={colors.muted} />
          <T v="muted" style={{ textAlign: 'center', marginTop: 8 }}>No tienes notificaciones. Aquí te avisamos de tus pagos, solicitudes, documentos y casos.</T>
        </View>
      }
      renderItem={({ item: n }) => (
        <Pressable
          onPress={() => openItem(n)}
          style={({ pressed }) => [s.item, !n.readAt && s.unread, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`${n.readAt ? '' : 'Sin leer. '}${n.title}. ${n.body}`}
        >
          {!n.readAt ? <View style={s.dot} /> : null}
          <View style={{ flex: 1 }}>
            <T v="h3" style={!n.readAt ? { fontFamily: fonts.bold } : undefined}>{n.title}</T>
            <T v="small" style={{ color: colors.ink, marginTop: 2 }}>{n.body}</T>
            <T v="small" style={{ marginTop: 4 }}>{fechaHora(n.createdAt)}</T>
          </View>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  unread: { borderColor: colors.mint, backgroundColor: '#f6fffc' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.mint, marginTop: 6 },
  empty: { alignItems: 'center', padding: 32, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.mist },
});
