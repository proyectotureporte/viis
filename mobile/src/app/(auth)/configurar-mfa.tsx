import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/services/auth';
import { AuthLayout } from '@/ui/AuthLayout';
import { Button, Checkbox, Field, Loading, Notice, ResultBanner, T } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

export default function ConfigurarMfa() {
  const { startMfaSetup, confirmMfaSetup, finishSetup, cancel, canUseBiometrics, biometricLabel } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; pending: string } | null>(null);
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(canUseBiometrics);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    startMfaSetup().then(setSetup).catch((e: Error) => setError(e.message));
  }, [startMfaSetup]);

  async function confirm() {
    if (!setup) return;
    setPending(true);
    setError(null);
    try {
      setCodes(await confirmMfaSetup(setup.pending, code, trust));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'El código no coincide.');
    } finally {
      setPending(false);
    }
  }

  if (codes) {
    return (
      <AuthLayout title="Guarda tus códigos" intro="Cada código sirve una sola vez si pierdes tu teléfono. No volveremos a mostrarlos.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: colors.mist, padding: 14, borderRadius: 12 }}>
          {codes.map((c) => (
            <T key={c} style={{ width: '46%', fontFamily: fonts.semibold, letterSpacing: 1 }} selectable>{c}</T>
          ))}
        </View>
        <Button title={copied ? 'Copiados' : 'Copiar códigos'} variant="secondary" onPress={async () => { await Clipboard.setStringAsync(codes.join('\n')); setCopied(true); }} />
        <Button title="Ya los guardé, continuar" onPress={finishSetup} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Protege tu cuenta" intro="OpenV exige verificación en dos pasos. Usa una aplicación autenticadora: Google Authenticator, Microsoft Authenticator, Authy o 1Password.">
      {!setup ? (
        error ? <ResultBanner result={{ ok: false, message: error }} /> : <Loading label="Preparando tu clave…" />
      ) : (
        <>
          <Button title="Abrir mi app autenticadora" onPress={() => Linking.openURL(setup.otpauth).catch(() => setError('No encontramos una app autenticadora. Copia la clave y agrégala manualmente.'))} />
          <T v="small">O agrega manualmente esta clave (tipo: basada en tiempo):</T>
          <T selectable style={{ fontFamily: fonts.semibold, letterSpacing: 1.5, backgroundColor: colors.mist, padding: 12, borderRadius: 10 }}>{setup.secret.match(/.{1,4}/g)?.join(' ')}</T>
          <Button title="Copiar clave" variant="secondary" small onPress={() => Clipboard.setStringAsync(setup.secret)} />
          <Notice tone="info">Después vuelve aquí y escribe el código de 6 dígitos que muestra la aplicación.</Notice>
          <Field label="Código de 6 dígitos" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={7} textContentType="oneTimeCode" />
          {canUseBiometrics ? <Checkbox checked={trust} onChange={setTrust}>{`Recordar este teléfono y desbloquear con ${biometricLabel}`}</Checkbox> : null}
          <ResultBanner result={error ? { ok: false, message: error } : null} />
          <Button title="Activar verificación" onPress={confirm} loading={pending} disabled={code.replace(/\s/g, '').length !== 6} />
        </>
      )}
      <Button title="Cancelar" variant="secondary" onPress={cancel} />
    </AuthLayout>
  );
}
