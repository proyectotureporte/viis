import { Stack, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, CircleX } from 'lucide-react-native';
import { View } from 'react-native';
import type { CertificateResponse } from '@/lib/movil/contract';
import { fecha } from '@/services/format';
import { useApi } from '@/services/hooks';
import { Card, ErrorState, KeyValue, Loading, Pill, Screen, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

/** Verificación de un certificado de la Academia contra el registro oficial (misma fuente que la web pública). */
export default function CertificadoScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data, error, loading, reload } = useApi<CertificateResponse>(`/certificados/${code}`);
  const c = data?.certificate;
  return (
    <>
      <Stack.Screen options={{ title: 'Verificación de certificado' }} />
      {loading && !c ? (
        <Loading label="Consultando el registro de la Academia…" />
      ) : error && !c ? (
        <ErrorState message={error} onRetry={reload} />
      ) : c ? (
        <Screen title="Certificado Academia OpenV" subtitle="Resultado de la verificación en el registro oficial de la Academia OpenV.">
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.lg }}>
              {c.valid ? <BadgeCheck size={28} color={colors.mintDeep} /> : <CircleX size={28} color={colors.danger} />}
              <Pill tone={c.valid ? 'ok' : 'bad'}>{c.valid ? 'Vigente' : 'Vencido'}</Pill>
            </View>
            <KeyValue
              items={[
                ['Titular', c.holder],
                ['Curso', `${c.course} (versión ${c.courseVersion})`],
                ['Puntaje', `${c.score}%`],
                ['Emitido', fecha(c.issuedAt)],
                ['Vigente hasta', fecha(c.expiresAt)],
                ['Código', c.code],
              ]}
            />
          </Card>
          <T v="small" style={{ marginTop: space.lg }}>Una entidad financiera puede verificar el mismo código en app.viis.app/certificados.</T>
        </Screen>
      ) : null}
    </>
  );
}
