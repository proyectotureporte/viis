import { Stack } from 'expo-router';
import { colors, fonts } from '@/ui/theme';

export const unstable_settings = { initialRouteName: 'index' };

export default function MasLayout() {
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
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Más' }} />
      <Stack.Screen name="embudo" options={{ title: 'Embudo' }} />
      <Stack.Screen name="equipo" options={{ title: 'Equipo' }} />
      <Stack.Screen name="academia/index" options={{ title: 'Academia' }} />
      <Stack.Screen name="academia/[slug]" options={{ title: 'Curso' }} />
    </Stack>
  );
}
