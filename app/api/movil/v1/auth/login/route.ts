import { z } from 'zod';
import { ApiError, handler, json } from '@/lib/movil/http';
import { passwordStep } from '@/lib/security/auth-flows';
import { requestMetaFrom } from '@/lib/security/request';
import { issueSessionToken } from '@/lib/security/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ email: z.string().max(320), password: z.string().max(200) });

/** Paso 1: contraseña. Devuelve un ticket (sesión sin MFA) que solo sirve para el paso 2. */
export const POST = handler(async (request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError('Escribe tu correo y tu contraseña.', 400);
  const meta = requestMetaFrom(request);
  const result = await passwordStep(parsed.data.email, parsed.data.password, meta);
  if (!result.ok) return json({ ok: false, message: result.message }, 401);
  const ticket = await issueSessionToken(result.user.id, meta, false);
  return json({ ok: true, ticket, next: result.user.totpEnabledAt ? 'mfa' : 'setup_mfa' });
});
