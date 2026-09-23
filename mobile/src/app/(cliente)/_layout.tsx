import { Tabs } from 'expo-router';
import { Calculator, ClipboardList, Ellipsis, House, Landmark } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/ui/theme';

/** Portal cliente: 5 pestañas; cada una con su pila de pantallas de detalle. */
export default function ClienteLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mintDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, height: 64 + insets.bottom, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 6) },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarAccessibilityLabel: 'Inicio', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="credito" options={{ title: 'Mi crédito', tabBarAccessibilityLabel: 'Mi crédito', tabBarIcon: ({ color, size }) => <Landmark color={color} size={size} /> }} />
      <Tabs.Screen name="decidir" options={{ title: 'Decidir', tabBarAccessibilityLabel: 'Decidir', tabBarIcon: ({ color, size }) => <Calculator color={color} size={size} /> }} />
      <Tabs.Screen name="gestiones" options={{ title: 'Gestiones', tabBarAccessibilityLabel: 'Gestiones', tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarAccessibilityLabel: 'Más opciones', tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} /> }} />
    </Tabs>
  );
}
