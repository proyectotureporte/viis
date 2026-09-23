import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/services/auth';
import { colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { status, user } = useAuth();
  const [fontsLoaded] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  const ready = fontsLoaded && status !== 'booting';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = status === 'signedIn' && Boolean(user);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* Acceso: cada estado de la sesión habilita solo su pantalla. */}
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="(auth)/desbloquear" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'mfa'}>
        <Stack.Screen name="(auth)/mfa" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'setupMfa' || (status === 'signedIn' && !user)}>
        <Stack.Screen name="(auth)/configurar-mfa" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)/ingresar" />
        <Stack.Screen name="(auth)/registro" options={{ presentation: 'modal' }} />
        <Stack.Screen name="(auth)/recuperar" options={{ presentation: 'modal' }} />
      </Stack.Protected>

      {/* Públicas: documentos legales y verificación de certificados (sin sesión). */}
      <Stack.Screen name="legal/[doc]" options={{ headerShown: true, title: 'Legal', headerTintColor: colors.ink, headerBackTitle: 'Atrás' }} />
      <Stack.Screen name="certificado/[code]" options={{ headerShown: true, title: 'Certificado', headerTintColor: colors.ink, headerBackTitle: 'Atrás' }} />

      {/* Portales: el rol decide cuál existe. El servidor vuelve a verificar todo. */}
      <Stack.Protected guard={signedIn && user?.portal === 'cliente'}>
        <Stack.Screen name="(cliente)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && user?.portal === 'aliado'}>
        <Stack.Screen name="(aliado)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && user?.portal === 'empresa'}>
        <Stack.Screen name="(empresa)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="notificaciones" options={{ headerShown: true, title: 'Notificaciones', headerTintColor: colors.ink }} />
        <Stack.Screen name="cuenta" options={{ headerShown: true, title: 'Mi cuenta', headerTintColor: colors.ink }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
