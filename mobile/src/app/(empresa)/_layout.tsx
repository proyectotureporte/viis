import { Stack } from 'expo-router';
import { DialogProvider } from '@/ui/empresa/dialogs';
import { EmpresaProvider } from '@/ui/empresa/context';
import { colors, fonts } from '@/ui/theme';

/**
 * Consola de empresa. Pila con las pestañas (`(tabs)`) y, encima, las
 * pantallas de detalle (expediente, ficha, solicitud, aliado y cada área de
 * "Más"), para que "atrás" vuelva siempre a donde estaba la persona.
 */
export default function EmpresaLayout() {
  return (
    <EmpresaProvider>
      <DialogProvider>
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
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Consola' }} />
          <Stack.Screen name="casos/[id]" options={{ title: 'Expediente' }} />
          <Stack.Screen name="casos/nuevo" options={{ title: 'Nuevo caso' }} />
          <Stack.Screen name="clientes/[id]" options={{ title: 'Ficha del cliente' }} />
          <Stack.Screen name="solicitudes/[id]" options={{ title: 'Solicitud' }} />
          <Stack.Screen name="aliados/[id]" options={{ title: 'Aliado' }} />
          <Stack.Screen name="area/[key]" options={{ title: '' }} />
        </Stack>
      </DialogProvider>
    </EmpresaProvider>
  );
}
