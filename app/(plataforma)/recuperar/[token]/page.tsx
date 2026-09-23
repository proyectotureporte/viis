import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/ov/AuthCard';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { PASSWORD_MIN_LENGTH } from '@/lib/security/password';
import { resetPasswordAction } from '../../ingresar/actions';

export const metadata: Metadata = { title: 'Nueva contraseña' };

export default async function NuevaClavePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthCard title="Crea una nueva contraseña" intro={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres combinando mayúsculas, minúsculas, números o símbolos. Cerraremos todas tus sesiones abiertas.`}>
      <ActionForm action={resetPasswordAction}>
        <input type="hidden" name="token" value={token} />
        <label className="ov-field"><span>Nueva contraseña</span><input name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /></label>
        <label className="ov-field"><span>Repite la contraseña</span><input name="confirm" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /></label>
        <SubmitButton pendingText="Guardando…">Guardar contraseña</SubmitButton>
      </ActionForm>
      <div className="ov-auth__links"><Link href="/ingresar">Ir a ingresar</Link></div>
    </AuthCard>
  );
}
