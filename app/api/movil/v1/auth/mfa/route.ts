import { z } from 'zod';
import { ApiError, handler, json } from '@/lib/movil/http';
import { trustDevice } from '@/lib/movil/devices';
import { mfaStep } from '@/lib/security/auth-flows';
import { requestMetaFrom } from '@/lib/security/request';
import { destroySession, elevateSessionToken, getSession } from '@/lib/security/session';
import { profile } from '../../yo/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ code: z.string().max(20), trustDevice: z.boolean().optional(), deviceName: z.string().max(120).optional(), platform: z.string().max(12).optional() });

/** Paso 2: código TOTP o de recuperación. Rota el token y, si se pide, confía en el dispositivo. */
export const POST = handler(async (request: Request) => {
  const session = await getSession();
  if (!session) throw new ApiError('El ingreso venció. Empieza de nuevo.', 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError('Escribe el código.', 400);
  const meta = requestMetaFrom(request);
  const result = await mfaStep(session.user.id, parsed.data.code, meta);
  if (!result.ok) {
    if (result.lockout) await destroySession();
    return json({ ok: false, message: result.message, lockout: Boolean(result.lockout) }, 401);
  }
  const token = await elevateSessionToken(session.id);
  const deviceToken = parsed.data.trustDevice ? await trustDevice(session.user.id, { name: parsed.data.deviceName, platform: parsed.data.platform }, meta) : undefined;
  return json({ ok: true, token, deviceToken, user: await profile(session.user.id) });
});
