import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/services/auth';
import { AuthLayout } from '@/ui/AuthLayout';
import { Button, Field, ResultBanner, T } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function Ingresar() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos ingresar.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Ingresa a OpenV" intro="Clientes, aliados y equipo OpenV usan el mismo acceso. Luego te pediremos el código de tu aplicación autenticadora.">
      <Field label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" />
      <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      <ResultBanner result={error ? { ok: false, message: error } : null} />
      <Button title="Continuar" onPress={submit} loading={pending} disabled={!email || !password} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Link href="/(auth)/recuperar"><T style={{ color: colors.blue }}>Olvidé mi contraseña</T></Link>
        <Link href="/(auth)/registro"><T style={{ color: colors.blue }}>Crear cuenta</T></Link>
      </View>
    </AuthLayout>
  );
}
