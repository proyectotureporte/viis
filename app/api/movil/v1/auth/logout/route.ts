import { handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { sha256 } from '@/lib/security/crypto';
import { destroySession, getSession } from '@/lib/security/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cierra la sesión; con `deviceToken` además deja de confiar en el teléfono. */
export const POST = handler(async (request: Request) => {
  const session = await getSession();
  const body = (await request.json().catch(() => ({}))) as { deviceToken?: string };
  if (typeof body.deviceToken === 'string' && body.deviceToken.length < 120) {
    await getPrisma().trustedDevice.updateMany({ where: { tokenHash: sha256(body.deviceToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  if (session) await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'auth.logout', entity: 'User', entityId: session.user.id, channel: 'movil' });
  await destroySession();
  return json({ ok: true });
});
