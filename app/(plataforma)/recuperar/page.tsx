import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/ov/AuthCard';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { requestResetAction } from '../ingresar/actions';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function RecuperarPage() {
  return (
    <AuthCard title="Recupera tu contraseña" intro="Te enviaremos un enlace de un solo uso, válido por 30 minutos.">
      <ActionForm action={requestResetAction}>
        <label className="ov-field">
          <span>Correo electrónico</span>
          <input name="email" type="email" autoComplete="email" required autoFocus />
        </label>
        <SubmitButton pendingText="Enviando…">Enviar enlace</SubmitButton>
      </ActionForm>
      <div className="ov-auth__links"><Link href="/ingresar">Volver a ingresar</Link></div>
    </AuthCard>
  );
}
