import { Fingerprint } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/services/auth';
import { AuthLayout } from '@/ui/AuthLayout';
import { Button, ResultBanner } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function Desbloquear() {
  const { unlock, deviceEmail, biometricLabel, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await unlock();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No pudimos desbloquear. Inténtalo de nuevo.');
    } finally {
      setPending(false);
    }
  }, [unlock]);

  // Pide la biometría apenas se muestra la pantalla (con un respiro para que termine la animación).
  useEffect(() => {
    const timer = setTimeout(() => void run(), 300);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <AuthLayout title="Desbloquea OpenV" intro={deviceEmail ? `Sesión de ${deviceEmail}` : undefined}>
      <ResultBanner result={error ? { ok: false, message: error } : null} />
      <Button title={`Desbloquear con ${biometricLabel}`} onPress={run} loading={pending} icon={<Fingerprint size={20} color={colors.navy} />} />
      <Button title="Ingresar con otra cuenta" variant="secondary" onPress={() => logout(true)} />
    </AuthLayout>
  );
}
