import { Tabs } from 'expo-router/js-tabs';
import { useFocusEffect } from 'expo-router';
import { ClipboardList, Ellipsis, House, Inbox } from 'lucide-react-native';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEmpresa } from '@/ui/empresa/context';
import { areaMeta, PANEL_PREFERENCE, QUEUE_KEYS } from '@/ui/empresa/nav';
import { colors, fonts } from '@/ui/theme';

const badge = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);

/** Pestañas de la consola: solo las que el rol puede usar, con contadores de pendientes. */
export default function EmpresaTabs() {
  const insets = useSafeAreaInsets();
  const { visible, badge: count, refreshMenu } = useEmpresa();
  useFocusEffect(
    useCallback(() => {
      void refreshMenu();
    }, [refreshMenu]),
  );

  const queues = QUEUE_KEYS.filter(visible);
  const panelKey = PANEL_PREFERENCE.find(visible) ?? null;
  const panel = panelKey ? areaMeta(panelKey) : null;
  const PanelIcon = panel?.icon ?? House;

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mintDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, minHeight: 16 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, height: 68 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 12) },
        tabBarBadgeStyle: { backgroundColor: colors.danger, fontFamily: fonts.bold, fontSize: 10 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Operación', tabBarAccessibilityLabel: 'Operación', tabBarBadge: badge(count('operacion')), tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen
        name="bandeja"
        options={{ href: visible('bandeja') ? undefined : null, title: 'Bandeja', tabBarAccessibilityLabel: 'Bandeja de casos', tabBarBadge: badge(count('bandeja')), tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="pendientes"
        options={{
          href: queues.length ? undefined : null,
          title: 'Pendientes',
          tabBarAccessibilityLabel: 'Pendientes: colas de trabajo',
          tabBarBadge: badge(queues.reduce((sum, k) => sum + count(k), 0)),
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="panel"
        options={{ href: panel ? undefined : null, title: panel?.label ?? 'Panel', tabBarAccessibilityLabel: panel?.label ?? 'Panel', tabBarBadge: panelKey ? badge(count(panelKey)) : undefined, tabBarIcon: ({ color, size }) => <PanelIcon color={color} size={size} /> }}
      />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarAccessibilityLabel: 'Más áreas', tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} /> }} />
    </Tabs>
  );
}
