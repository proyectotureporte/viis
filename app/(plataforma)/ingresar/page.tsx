import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/ov/AuthCard';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { getSession, homeFor } from '@/lib/security/session';
import { loginAction } from './actions';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function IngresarPage() {
  const session = await getSession();
  if (session?.mfaPassed) redirect(homeFor(session.user.role));
  return (
    <AuthCard title="Ingresa a OpenV" intro="Clientes, aliados y equipo OpenV usan el mismo acceso. Luego te pediremos el código de tu aplicación autenticadora.">
      <ActionForm action={loginAction}>
        <label className="ov-field">
          <span>Correo electrónico</span>
          <input name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label className="ov-field">
          <span>Contraseña</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <SubmitButton pendingText="Verificando…">Continuar</SubmitButton>
      </ActionForm>
      <div className="ov-auth__links">
        <Link href="/recuperar">Olvidé mi contraseña</Link>
        <Link href="/registro">Crear cuenta de cliente</Link>
      </div>
      <p className="ov-meta" style={{ marginTop: 14, textAlign: 'center' }}><Link href="/descargar">Descarga la app para Android y iPhone</Link></p>
    </AuthCard>
  );
}
