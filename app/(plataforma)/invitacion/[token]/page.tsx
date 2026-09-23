import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/ov/AuthCard';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { PASSWORD_MIN_LENGTH } from '@/lib/security/password';
import { acceptInviteAction } from '../../ingresar/actions';

export const metadata: Metadata = { title: 'Activa tu cuenta' };

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthCard title="Activa tu cuenta OpenV" intro="Crea tu contraseña. En el siguiente paso configurarás la verificación en dos pasos.">
      <ActionForm action={acceptInviteAction}>
        <input type="hidden" name="token" value={token} />
        <label className="ov-field"><span>Contraseña</span><input name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /></label>
        <label className="ov-field"><span>Repite la contraseña</span><input name="confirm" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /></label>
        <label className="ov-check">
          <input type="checkbox" name="terms" required />
          <span>Acepto los <Link href="/legal/terminos" target="_blank">términos de uso</Link>, la <Link href="/legal/privacidad" target="_blank">política de tratamiento de datos</Link> y me comprometo a usar la información de clientes solo para las finalidades autorizadas.</span>
        </label>
        <SubmitButton pendingText="Activando…">Activar cuenta</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
