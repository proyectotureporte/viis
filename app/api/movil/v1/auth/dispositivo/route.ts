import { z } from 'zod';
import { ApiError, handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { sha256 } from '@/lib/security/crypto';
import { recordAttempt, tooManyAttempts } from '@/lib/security/ratelimit';
import { requestMetaFrom } from '@/lib/security/request';
import { issueSessionToken } from '@/lib/security/session';
import { profile } from '../../yo/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ deviceToken: z.string().min(40).max(100) });

/**
 * Desbloqueo con biometría: la app lee el token del llavero SOLO tras Face ID /
 * huella y lo cambia por una sesión nueva. Revocable desde Mi cuenta.
 */
export const POST = handler(async (request: Request) => {
  const meta = requestMetaFrom(request);
  const key = `device:${meta.ipHash ?? 'none'}`;
  if (await tooManyAttempts([key], 20, 15 * 60 * 1_000)) throw new ApiError('Demasiados intentos. Espera unos minutos.', 429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError('Dispositivo no reconocido.', 401);
  const prisma = getPrisma();
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: sha256(parsed.data.deviceToken) }, include: { user: { include: { organization: { select: { active: true } } } } } });
  const valid =
    device && !device.revokedAt && device.expiresAt > new Date() && device.user.active && device.user.totpEnabledAt && device.user.organization?.active !== false;
  if (!valid) {
    await recordAttempt([key], false);
    return json({ ok: false, message: 'Este teléfono ya no está autorizado. Ingresa con tu contraseña.' }, 401);
  }
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  const token = await issueSessionToken(device.userId, meta, true);
  await audit({ actorId: device.userId, actorRole: device.user.role, action: 'auth.device_unlock', entity: 'TrustedDevice', entityId: device.id, ipHash: meta.ipHash, channel: 'movil' });
  return json({ ok: true, token, user: await profile(device.userId) });
});
