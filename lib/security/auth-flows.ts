import type { User } from '@/app/generated/prisma/client';
import { enqueueEmail } from '@/lib/jobs';
import { appUrl } from '@/lib/mail';
import { getPrisma } from '@/lib/prisma';
import { audit } from './audit';
import { decryptText, encryptText, randomToken, sha256 } from './crypto';
import { verifyPassword } from './password';
import { recordAttempt, tooManyAttempts } from './ratelimit';
import type { RequestMeta } from './request';
import { generateRecoveryCodes, verifyTotp } from './totp';

/**
 * Reglas de ingreso compartidas por la web (server actions) y la app móvil
 * (API Bearer): bloqueo por intentos, límite por conexión, anti-reutilización
 * de códigos TOTP, códigos de recuperación y auditoría. Un solo lugar.
 */

const LOCK_AFTER = 5;
export const LOCK_MS = 15 * 60 * 1_000;
const GENERIC = 'Correo o contraseña incorrectos.';

type Fail = { ok: false; message: string };

export async function sendVerification(user: { id: string; email: string; name: string }): Promise<void> {
  const token = randomToken();
  await getPrisma().authToken.create({
    data: { userId: user.id, purpose: 'EMAIL_VERIFY', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 48 * 3_600_000) },
  });
  await enqueueEmail({
    to: user.email,
    subject: 'Confirma tu correo en OpenV',
    title: `Hola ${user.name.split(' ')[0]}, confirma tu correo`,
    paragraphs: ['Para proteger tu cuenta necesitamos confirmar que este correo es tuyo. El enlace vence en 48 horas.'],
    cta: { label: 'Confirmar mi correo', href: appUrl(`/verificar-correo/${token}`) },
  });
}

export async function passwordStep(emailRaw: string, passwordRaw: string, meta: RequestMeta): Promise<Fail | { ok: true; user: User }> {
  const email = emailRaw.trim().toLowerCase().slice(0, 320);
  const password = passwordRaw.slice(0, 200);
  if (!email || !password) return { ok: false, message: 'Escribe tu correo y tu contraseña.' };

  const keys = [`login:ip:${meta.ipHash ?? 'none'}`, `login:email:${email}`];
  if (await tooManyAttempts([keys[0]], 30, LOCK_MS)) return { ok: false, message: 'Demasiados intentos desde esta conexión. Espera 15 minutos.' };

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, message: 'La cuenta está bloqueada temporalmente por intentos fallidos. Espera 15 minutos o recupera tu contraseña.' };
  }
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid || !user.active) {
    await recordAttempt(keys, false);
    if (user) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null },
      });
      await audit({ actorId: user.id, actorRole: user.role, action: 'auth.login_failed', entity: 'User', entityId: user.id, after: { failed }, ipHash: meta.ipHash });
    }
    return { ok: false, message: GENERIC };
  }

  if (!user.emailVerifiedAt) {
    await sendVerification(user);
    return { ok: false, message: 'Antes de ingresar confirma tu correo. Te enviamos un nuevo enlace.' };
  }

  await recordAttempt(keys, true);
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit({ actorId: user.id, actorRole: user.role, action: 'auth.password_ok', entity: 'User', entityId: user.id, ipHash: meta.ipHash });
  return { ok: true, user };
}

/** Verifica un TOTP o código de recuperación. `lockout` indica que hay que cerrar la sesión. */
export async function mfaStep(userId: string, codeRaw: string, meta: RequestMeta): Promise<(Fail & { lockout?: boolean }) | { ok: true; user: User; method: 'totp' | 'recovery' }> {
  const code = codeRaw.trim().toLowerCase();
  const key = `mfa:${userId}`;
  if (await tooManyAttempts([key], 6, LOCK_MS)) {
    return { ok: false, lockout: true, message: 'Demasiados códigos incorrectos. Por seguridad cerramos la sesión; espera 15 minutos.' };
  }
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecretEnc || !user.totpEnabledAt) return { ok: false, message: 'Primero configura la verificación en dos pasos.' };

  let method: 'totp' | 'recovery' | null = null;
  if (/^[a-z2-7]{5}-[a-z2-7]{5}$/.test(code)) {
    const hash = sha256(code);
    if (user.recoveryCodes.includes(hash)) {
      await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: user.recoveryCodes.filter((c) => c !== hash) } });
      method = 'recovery';
    }
  } else {
    const counter = verifyTotp(decryptText(user.totpSecretEnc), code);
    if (counter !== null && (user.totpLastCounter === null || counter > user.totpLastCounter)) {
      await prisma.user.update({ where: { id: user.id }, data: { totpLastCounter: counter } });
      method = 'totp';
    }
  }

  if (!method) {
    await recordAttempt([key], false);
    await audit({ actorId: user.id, actorRole: user.role, action: 'auth.mfa_failed', entity: 'User', entityId: user.id, ipHash: meta.ipHash });
    return { ok: false, message: 'Código incorrecto o ya usado.' };
  }

  await recordAttempt([key], true);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ actorId: user.id, actorRole: user.role, action: 'auth.login', entity: 'User', entityId: user.id, after: { method, channel: meta.userAgent?.startsWith('OpenV-Movil') ? 'movil' : 'web' }, ipHash: meta.ipHash });
  if (method === 'recovery') {
    await enqueueEmail({
      to: user.email,
      subject: 'Usaste un código de recuperación en OpenV',
      title: 'Ingresaste con un código de recuperación',
      paragraphs: [
        `Te quedan ${user.recoveryCodes.length - 1} códigos. Si no fuiste tú, cambia tu contraseña de inmediato y cierra las sesiones abiertas desde Mi cuenta.`,
      ],
      cta: { label: 'Revisar mi seguridad', href: appUrl('/cuenta') },
    });
  }
  return { ok: true, user, method };
}

/** Activa (o cambia) el autenticador tras comprobar un código generado con el secreto nuevo. */
export async function confirmTotp(userId: string, secret: string, code: string, meta: RequestMeta): Promise<Fail | { ok: true; codes: string[] }> {
  const counter = verifyTotp(secret, code);
  if (counter === null) return { ok: false, message: 'El código no coincide. Revisa la hora de tu teléfono y escribe el código actual.' };
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const codes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: encryptText(secret), totpEnabledAt: new Date(), totpLastCounter: counter, recoveryCodes: codes.map((c) => sha256(c)) },
  });
  await audit({ actorId: user.id, actorRole: user.role, action: user.totpEnabledAt ? 'auth.mfa_reset' : 'auth.mfa_enabled', entity: 'User', entityId: user.id, ipHash: meta.ipHash });
  await enqueueEmail({
    to: user.email,
    subject: 'Activaste la verificación en dos pasos',
    title: 'Tu cuenta OpenV tiene verificación en dos pasos',
    paragraphs: ['A partir de ahora pediremos un código de tu aplicación autenticadora cada vez que ingreses. Si no fuiste tú, contáctanos de inmediato.'],
  });
  return { ok: true, codes };
}
