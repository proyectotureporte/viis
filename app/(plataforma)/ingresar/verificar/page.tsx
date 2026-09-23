import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/ov/AuthCard';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { getSession, homeFor } from '@/lib/security/session';
import { logoutAction, verifyMfaAction } from '../actions';

export const metadata: Metadata = { title: 'Verificación en dos pasos' };

export default async function VerificarPage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  if (!session.user.totpEnabled) redirect('/ingresar/configurar-mfa');
  if (session.mfaPassed) redirect(homeFor(session.user.role));
  return (
    <AuthCard title="Verificación en dos pasos" intro="Escribe el código de 6 dígitos que muestra tu aplicación autenticadora. Si perdiste el teléfono, usa uno de tus códigos de recuperación.">
      <ActionForm action={verifyMfaAction}>
        <label className="ov-field">
          <span>Código</span>
          <input name="code" inputMode="text" autoComplete="one-time-code" required autoFocus maxLength={11} placeholder="123456 o abcde-fghij" />
        </label>
        <SubmitButton pendingText="Verificando…">Ingresar</SubmitButton>
      </ActionForm>
      <form action={logoutAction} className="ov-auth__links">
        <button type="submit" className="ov-linkbtn">Usar otra cuenta</button>
        <span className="ov-meta">¿Perdiste ambos? contacto@viis.app</span>
      </form>
    </AuthCard>
  );
}
