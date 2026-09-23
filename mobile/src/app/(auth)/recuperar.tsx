import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/services/api';
import { AuthLayout } from '@/ui/AuthLayout';
import { Button, Field, ResultBanner } from '@/ui/kit';

export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <AuthLayout title="Recupera tu contraseña" intro="Te enviaremos un enlace de un solo uso, válido por 30 minutos, para crear una nueva contraseña.">
      <Field label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <ResultBanner result={result} />
      <Button
        title="Enviar enlace"
        loading={pending}
        disabled={!email}
        onPress={async () => {
          setPending(true);
          setResult(await api.post('/auth/recuperar', { email }, { auth: null }).catch((e: Error) => ({ ok: false, message: e.message })));
          setPending(false);
        }}
      />
      <Button title="Volver" variant="secondary" onPress={() => router.back()} />
    </AuthLayout>
  );
}
