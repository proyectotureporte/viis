import { Stack } from 'expo-router';
import { colors, fonts } from '@/ui/theme';

/** Pila de una pestaña: la raíz sin encabezado; los detalles con título y "atrás". */
export function TabStack({ screens }: { screens: { name: string; title: string }[] }) {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 16 },
        headerStyle: { backgroundColor: colors.white },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {screens.map((s) => (
        <Stack.Screen key={s.name} name={s.name} options={{ title: s.title }} />
      ))}
    </Stack>
  );
}
