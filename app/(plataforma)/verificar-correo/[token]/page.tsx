import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/ov/AuthCard';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { verifyEmailAction } from '../../ingresar/actions';

export const metadata: Metadata = { title: 'Confirmar correo' };

/** La confirmación exige un clic: los escáneres de correo que abren enlaces no la consumen. */
export default async function VerificarCorreoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthCard title="Confirma tu correo" intro="Pulsa el botón para confirmar que este correo es tuyo.">
      <ActionForm action={verifyEmailAction}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton pendingText="Confirmando…">Confirmar mi correo</SubmitButton>
      </ActionForm>
      <div className="ov-auth__links"><Link href="/ingresar">Ir a ingresar</Link></div>
    </AuthCard>
  );
}
