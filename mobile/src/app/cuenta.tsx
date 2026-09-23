import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, Fingerprint, LogOut, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { API_URL, APP_VERSION, PLATFORM } from '@/services/config';
import { Button, Card, KeyValue, Notice, Pill, ResultBanner, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

const LEGAL = [
  { title: 'Política de privacidad y tratamiento de datos', path: '/legal/privacidad' },
  { title: 'Términos y condiciones', path: '/legal/terminos' },
];

/** Mi cuenta: común a los tres portales. */
export default function Cuenta() {
  const { user, logout, deviceEmail, canUseBiometrics, biometricLabel } = useAuth();
  const [pending, setPending] = useState<'logout' | 'forget' | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'logout' | 'forget') {
    setPending(kind);
    setError(null);
    try {
      await logout(kind === 'forget');
    } catch {
      setError('No pudimos cerrar la sesión. Inténtalo de nuevo.');
      setPending(null);
    }
  }

  async function openLegal(path: string) {
    try {
      await WebBrowser.openBrowserAsync(`${API_URL}${path}`, { toolbarColor: colors.white, controlsColor: colors.navy });
    } catch {
      setError('No pudimos abrir el documento. Revisa tu conexión.');
    }
  }

  if (!user) return null;
  const remembered = Boolean(deviceEmail && deviceEmail.toLowerCase() === user.email.toLowerCase());

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }}>
      <Card>
        <T v="h2">{user.name}</T>
        <T v="muted" selectable style={{ marginTop: 2 }}>{user.email}</T>
        <View style={{ marginTop: 12 }}>
          <KeyValue items={[['Perfil', user.roleLabel], ['Organización', user.organization?.name ?? '—']]} />
        </View>
      </Card>

      <Section title="Seguridad de este teléfono">
        <Card>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Fingerprint size={24} color={colors.navy} />
            <View style={{ flex: 1 }}>
              <T v="h3">{PLATFORM === 'otro' ? 'Desbloqueo biométrico' : `Desbloqueo con ${biometricLabel}`}</T>
              <T v="small" style={{ marginTop: 2 }}>
                {PLATFORM === 'otro'
                  ? 'En la web no hay desbloqueo biométrico: ingresas con correo, contraseña y código.'
                  : !canUseBiometrics
                    ? `Este teléfono no tiene ${biometricLabel} configurado. Actívalo en los ajustes del sistema para recordar el teléfono.`
                    : remembered
                      ? `Activo: al abrir la app la desbloqueas con ${biometricLabel}. Tras 5 minutos en segundo plano se vuelve a bloquear.`
                      : 'No activo: la próxima vez que ingreses marca “Recordar este teléfono” para desbloquear con biometría.'}
              </T>
              <View style={{ marginTop: 8 }}>
                <Pill tone={remembered ? 'ok' : 'gray'}>{remembered ? 'Teléfono recordado' : 'No recordado'}</Pill>
              </View>
            </View>
          </View>
        </Card>
        <T v="small">La sesión se cierra tras 30 minutos sin actividad y a las 12 horas, igual que en la web.</T>
      </Section>

      <Section title="Sesión">
        <Button variant="secondary" title="Cerrar sesión" icon={<LogOut size={18} color={colors.ink} />} onPress={() => run('logout')} loading={pending === 'logout'} />
        {remembered ? (
          confirmForget ? (
            <Card>
              <Notice>Se borrará el acceso con {biometricLabel} de este teléfono y se revocará en el servidor. Para volver a entrar necesitarás tu contraseña y el código.</Notice>
              <View style={{ gap: 8, marginTop: 10 }}>
                <Button variant="danger" title="Sí, olvidar este teléfono" onPress={() => run('forget')} loading={pending === 'forget'} />
                <Button variant="secondary" title="Cancelar" onPress={() => setConfirmForget(false)} />
              </View>
            </Card>
          ) : (
            <Button variant="secondary" title="Olvidar este teléfono" icon={<Smartphone size={18} color={colors.ink} />} onPress={() => setConfirmForget(true)} />
          )
        ) : null}
        <ResultBanner result={error ? { ok: false, message: error } : null} />
      </Section>

      <Section title="Documentos legales">
        {LEGAL.map((l) => (
          <Button key={l.path} variant="secondary" title={l.title} icon={<ExternalLink size={16} color={colors.ink} />} onPress={() => openLegal(l.path)} />
        ))}
      </Section>

      <T v="small" style={{ textAlign: 'center', marginTop: 28 }}>OpenV · versión {APP_VERSION} ({PLATFORM === 'ios' ? 'iOS' : PLATFORM === 'android' ? 'Android' : 'web'})</T>
    </ScrollView>
  );
}
