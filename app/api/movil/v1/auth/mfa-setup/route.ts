import { ApiError, handler, json } from '@/lib/movil/http';
import { encryptText } from '@/lib/security/crypto';
import { getSession } from '@/lib/security/session';
import { generateTotpSecret, otpauthUri } from '@/lib/security/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Genera un secreto TOTP para activarlo desde el teléfono. Se devuelve cifrado
 * (`pending`) para confirmarlo después; la app ofrece abrir el autenticador
 * con el enlace otpauth:// o copiar la clave.
 */
export const POST = handler(async () => {
  const session = await getSession();
  if (!session) throw new ApiError('El ingreso venció. Empieza de nuevo.', 401);
  if (session.user.totpEnabled && !session.mfaPassed) throw new ApiError('Primero verifica tu código actual.', 403);
  const secret = generateTotpSecret();
  return json({ ok: true, secret, otpauth: otpauthUri(secret, session.user.email), pending: encryptText(secret) });
});
