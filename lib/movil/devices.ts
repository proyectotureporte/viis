import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { randomToken, sha256 } from '@/lib/security/crypto';
import type { RequestMeta } from '@/lib/security/request';

export const DEVICE_TTL_MS = 60 * 24 * 3_600_000;
export const MAX_DEVICES = 5;

/** Registra el teléfono como dispositivo de confianza (solo tras login + MFA). */
export async function trustDevice(userId: string, input: { name?: string; platform?: string }, meta: RequestMeta): Promise<string> {
  const prisma = getPrisma();
  const token = randomToken(48);
  const active = await prisma.trustedDevice.findMany({ where: { userId, revokedAt: null }, orderBy: { lastUsedAt: 'desc' } });
  // Máximo 5 teléfonos: se revoca el más antiguo.
  for (const old of active.slice(MAX_DEVICES - 1)) {
    await prisma.trustedDevice.update({ where: { id: old.id }, data: { revokedAt: new Date() } });
  }
  const device = await prisma.trustedDevice.create({
    data: {
      userId,
      tokenHash: sha256(token),
      name: (input.name || 'Teléfono').slice(0, 120),
      platform: input.platform === 'ios' ? 'ios' : input.platform === 'android' ? 'android' : 'otro',
      expiresAt: new Date(Date.now() + DEVICE_TTL_MS),
    },
  });
  await audit({ actorId: userId, action: 'auth.device_trusted', entity: 'TrustedDevice', entityId: device.id, after: { name: device.name, platform: device.platform }, ipHash: meta.ipHash, channel: 'movil' });
  return token;
}
