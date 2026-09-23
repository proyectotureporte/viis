import { Stack } from 'expo-router';
import { colors, fonts } from '@/ui/theme';

export const unstable_settings = { initialRouteName: 'index' };

export default function ClientesLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Clientes' }} />
      <Stack.Screen name="nuevo" options={{ title: 'Nuevo cliente' }} />
      <Stack.Screen name="[id]" options={{ title: 'Ficha del cliente' }} />
    </Stack>
  );
}
