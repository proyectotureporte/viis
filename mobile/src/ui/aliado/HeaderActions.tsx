import { router, useFocusEffect } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { colors, fonts } from '@/ui/theme';

const REFRESH_EVERY_MS = 30_000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '·';
}

/** Campana con contador de no leídas (→ /notificaciones) y avatar (→ /cuenta). */
export function HeaderActions() {
  const { user, refreshUser } = useAuth();
  const refreshRef = useRef(refreshUser);
  const lastRef = useRef(0);
  useEffect(() => {
    refreshRef.current = refreshUser;
  }, [refreshUser]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastRef.current < REFRESH_EVERY_MS) return;
      lastRef.current = Date.now();
      void refreshRef.current().catch(() => undefined);
    }, []),
  );

  const unread = user?.unreadNotifications ?? 0;
  return (
    <View style={s.wrap}>
      <Pressable
        onPress={() => router.push('/notificaciones')}
        style={({ pressed }) => [s.icon, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        hitSlop={6}
      >
        <Bell size={21} color={colors.ink} />
        {unread > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => router.push('/cuenta')}
        style={({ pressed }) => [s.avatar, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel="Mi cuenta"
        hitSlop={6}
      >
        <Text style={s.avatarText}>{initials(user?.name ?? '')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 10.5 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
});
