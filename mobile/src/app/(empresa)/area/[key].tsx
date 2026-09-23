import { Stack, useLocalSearchParams } from 'expo-router';
import type { AreaKey } from '@/lib/movil/contract-empresa';
import { AREA_SCREENS } from '@/ui/empresa/areas';
import { useEmpresa } from '@/ui/empresa/context';
import { AREAS } from '@/ui/empresa/nav';
import { ErrorState } from '@/ui/kit';

/** Área de la consola abierta desde "Más" (con encabezado y "atrás"). */
export default function AreaScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { visible } = useEmpresa();
  const meta = AREAS.find((a) => a.key === key);
  if (!meta || !visible(meta.key)) {
    return (
      <>
        <Stack.Screen options={{ title: 'Consola' }} />
        <ErrorState message="Esta área no existe o tu rol no tiene acceso." />
      </>
    );
  }
  const Area = AREA_SCREENS[meta.key as AreaKey];
  return (
    <>
      <Stack.Screen options={{ title: meta.label }} />
      <Area />
    </>
  );
}
