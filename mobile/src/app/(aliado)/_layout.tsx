import { Tabs } from 'expo-router/js-tabs';
import { CalendarDays, Ellipsis, LayoutDashboard, Users, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/ui/theme';

/** Portal aliado: 5 pestañas; los detalles viven en pilas anidadas (clientes/, mas/). */
export default function AliadoLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mintDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumen', tabBarAccessibilityLabel: 'Resumen', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarAccessibilityLabel: 'Clientes', tabBarIcon: ({ color, size }) => <Users color={color} size={size} />, popToTopOnBlur: true }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarAccessibilityLabel: 'Agenda', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="comisiones" options={{ title: 'Comisiones', tabBarAccessibilityLabel: 'Comisiones', tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarAccessibilityLabel: 'Más opciones', tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} />, popToTopOnBlur: true }} />
    </Tabs>
  );
}
