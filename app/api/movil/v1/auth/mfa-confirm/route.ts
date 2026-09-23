import { z } from 'zod';
import { ApiError, handler, json } from '@/lib/movil/http';
import { trustDevice } from '@/lib/movil/devices';
import { confirmTotp } from '@/lib/security/auth-flows';
import { decryptText } from '@/lib/security/crypto';
import { requestMetaFrom } from '@/lib/security/request';
import { elevateSessionToken, getSession } from '@/lib/security/session';
import { profile } from '../../yo/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ pending: z.string().max(400), code: z.string().max(10), trustDevice: z.boolean().optional(), deviceName: z.string().max(120).optional(), platform: z.string().max(12).optional() });

export const POST = handler(async (request: Request) => {
  const session = await getSession();
  if (!session) throw new ApiError('El ingreso venció. Empieza de nuevo.', 401);
  if (session.user.totpEnabled && !session.mfaPassed) throw new ApiError('Primero verifica tu código actual.', 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError('Escribe el código.', 400);
  let secret: string;
  try {
    secret = decryptText(parsed.data.pending);
  } catch {
    throw new ApiError('La configuración venció. Empieza de nuevo.', 400);
  }
  const meta = requestMetaFrom(request);
  const result = await confirmTotp(session.user.id, secret, parsed.data.code, meta);
  if (!result.ok) return json({ ok: false, message: result.message }, 422);
  const token = await elevateSessionToken(session.id);
  const deviceToken = parsed.data.trustDevice ? await trustDevice(session.user.id, { name: parsed.data.deviceName, platform: parsed.data.platform }, meta) : undefined;
  return json({ ok: true, token, deviceToken, recoveryCodes: result.codes, user: await profile(session.user.id) });
});
