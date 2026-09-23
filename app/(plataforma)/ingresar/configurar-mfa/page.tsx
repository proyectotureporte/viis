import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { AuthCard } from '@/components/ov/AuthCard';
import { encryptText } from '@/lib/security/crypto';
import { getSession, homeFor } from '@/lib/security/session';
import { generateTotpSecret, otpauthUri } from '@/lib/security/totp';
import { TotpSetup } from './TotpSetup';

export const metadata: Metadata = { title: 'Activa la verificación en dos pasos' };

export default async function ConfigurarMfaPage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  // Reconfigurar un segundo factor ya activo exige haberlo superado antes.
  if (session.user.totpEnabled && !session.mfaPassed) redirect('/ingresar/verificar');
  const secret = generateTotpSecret();
  const uri = otpauthUri(secret, session.user.email);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 400, errorCorrectionLevel: 'M' });
  return (
    <AuthCard
      wide
      title={session.user.totpEnabled ? 'Cambia tu aplicación autenticadora' : 'Protege tu cuenta'}
      intro="OpenV exige verificación en dos pasos a todos los usuarios. Instala una aplicación autenticadora (Google Authenticator, Microsoft Authenticator, Authy o 1Password) y escanea este código."
    >
      <TotpSetup qr={qr} secret={secret} pending={encryptText(secret)} home={homeFor(session.user.role)} />
    </AuthCard>
  );
}
