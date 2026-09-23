import { useState } from 'react';
import { useAuth } from '@/services/auth';
import { AuthLayout } from '@/ui/AuthLayout';
import { Button, Checkbox, Field, ResultBanner, T } from '@/ui/kit';

export default function Mfa() {
  const { verifyMfa, cancel, canUseBiometrics, biometricLabel } = useAuth();
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(canUseBiometrics);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await verifyMfa(code, trust);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código incorrecto.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Verificación en dos pasos" intro="Escribe el código de 6 dígitos de tu aplicación autenticadora. Si perdiste el teléfono, usa un código de recuperación.">
      <Field label="Código" value={code} onChangeText={setCode} autoCapitalize="none" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="123456 o abcde-fghij" maxLength={11} onSubmitEditing={submit} />
      {canUseBiometrics ? (
        <Checkbox checked={trust} onChange={setTrust}>{`Recordar este teléfono y desbloquear con ${biometricLabel}`}</Checkbox>
      ) : (
        <T v="small">Activa Face ID, huella o un código de bloqueo en el teléfono para poder desbloquear OpenV sin repetir este paso.</T>
      )}
      <ResultBanner result={error ? { ok: false, message: error } : null} />
      <Button title="Ingresar" onPress={submit} loading={pending} disabled={code.trim().length < 6} />
      <Button title="Usar otra cuenta" variant="secondary" onPress={cancel} />
    </AuthLayout>
  );
}
