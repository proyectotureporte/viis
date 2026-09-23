'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { fail, ok } from '@/lib/actions';
import type { ActionState } from '@/components/ov/forms';
import { CONSENT_PURPOSES, consentRecords, normalizeDocument } from '@/lib/consent';
import { enqueueEmail } from '@/lib/jobs';
import { appUrl } from '@/lib/mail';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { blindIndex, decryptText, encryptText, randomToken, sha256 } from '@/lib/security/crypto';
import { hashPassword, passwordProblem } from '@/lib/security/password';
import { recordAttempt, tooManyAttempts } from '@/lib/security/ratelimit';
import { requestChannel, requestMeta } from '@/lib/security/request';
import { confirmTotp, mfaStep, passwordStep, sendVerification } from '@/lib/security/auth-flows';
import { createSession, destroySession, elevateSession, getSession, homeFor } from '@/lib/security/session';


async function issueToken(userId: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'INVITE', ttlMs: number): Promise<string> {
  const token = randomToken();
  await getPrisma().authToken.create({
    data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

// ── Ingreso ──────────────────────────────────────────────────────────────

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  const result = await passwordStep(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''), meta);
  if (!result.ok) return fail(result.message);
  await createSession(result.user.id, meta, false);
  redirect(result.user.totpEnabledAt ? '/ingresar/verificar' : '/ingresar/configurar-mfa');
}

// ── Segundo factor ───────────────────────────────────────────────────────

export async function verifyMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  if (!session.user.totpEnabled) redirect('/ingresar/configurar-mfa');
  const result = await mfaStep(session.user.id, String(formData.get('code') ?? ''), await requestMeta());
  if (!result.ok) {
    if (result.lockout) await destroySession();
    return fail(result.message);
  }
  await elevateSession(session.id);
  redirect(homeFor(result.user.role));
}

export type SetupState = (ActionState & { codes?: string[] }) | null;

export async function confirmTotpAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  // Reconfigurar exige haber superado el segundo factor en esta sesión.
  if (session.user.totpEnabled && !session.mfaPassed) redirect('/ingresar/verificar');
  const pending = String(formData.get('pending') ?? '');
  let secret: string;
  try {
    secret = decryptText(pending);
  } catch {
    return fail('Recarga la página e inténtalo de nuevo.');
  }
  const result = await confirmTotp(session.user.id, secret, String(formData.get('code') ?? ''), await requestMeta());
  if (!result.ok) return fail(result.message);
  await elevateSession(session.id);
  return { ok: true, message: 'Verificación en dos pasos activada.', codes: result.codes };
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'auth.logout', entity: 'User', entityId: session.user.id });
  }
  await destroySession();
  redirect('/ingresar');
}

// ── Recuperación ─────────────────────────────────────────────────────────

export async function requestResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 320);
  const meta = await requestMeta();
  const answer = ok('Si el correo está registrado, recibirás un enlace para crear una nueva contraseña en los próximos minutos.');
  if (!z.email().safeParse(email).success) return fail('Escribe un correo válido.');
  const keys = [`reset:ip:${meta.ipHash ?? 'none'}`, `reset:email:${email}`];
  if (await tooManyAttempts(keys, 5, 60 * 60 * 1_000)) return answer;
  await recordAttempt(keys, false);
  const user = await getPrisma().user.findUnique({ where: { email } });
  if (user?.active) {
    const token = await issueToken(user.id, 'PASSWORD_RESET', 30 * 60 * 1_000);
    await enqueueEmail({
      to: user.email,
      subject: 'Restablece tu contraseña de OpenV',
      title: 'Restablece tu contraseña',
      paragraphs: [
        'Recibimos una solicitud para cambiar tu contraseña. El enlace vence en 30 minutos y solo puede usarse una vez.',
        'Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando.',
      ],
      cta: { label: 'Crear nueva contraseña', href: appUrl(`/recuperar/${token}`) },
    });
    await audit({ actorId: user.id, actorRole: user.role, action: 'auth.reset_requested', entity: 'User', entityId: user.id, ipHash: meta.ipHash });
  }
  return answer;
}

async function consumeToken(token: string, purpose: 'PASSWORD_RESET' | 'INVITE' | 'EMAIL_VERIFY') {
  const prisma = getPrisma();
  const record = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;
  const claimed = await prisma.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? record : null;
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password !== String(formData.get('confirm') ?? '')) return fail('Las contraseñas no coinciden.');
  const prisma = getPrisma();
  const preview = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!preview) return fail('El enlace no es válido o ya venció. Solicita uno nuevo.');
  const problem = passwordProblem(password, preview.user.email);
  if (problem) return fail(problem);
  const record = await consumeToken(token, 'PASSWORD_RESET');
  if (!record) return fail('El enlace no es válido o ya venció. Solicita uno nuevo.');
  const meta = await requestMeta();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
    }),
    prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.trustedDevice.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ actorId: record.userId, actorRole: record.user.role, action: 'auth.password_reset', entity: 'User', entityId: record.userId, ipHash: meta.ipHash });
  await enqueueEmail({
    to: record.user.email,
    subject: 'Tu contraseña de OpenV cambió',
    title: 'Tu contraseña fue cambiada',
    paragraphs: ['Cerramos todas las sesiones abiertas. Si no fuiste tú, contáctanos de inmediato en contacto@viis.app.'],
  });
  return ok('Contraseña actualizada. Ya puedes ingresar.');
}

// ── Invitaciones (equipo interno y aliados) ──────────────────────────────

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password !== String(formData.get('confirm') ?? '')) return fail('Las contraseñas no coinciden.');
  if (formData.get('terms') !== 'on') return fail('Debes aceptar los términos y la política de tratamiento de datos.');
  const prisma = getPrisma();
  const preview = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!preview) return fail('La invitación no es válida o venció. Pide una nueva al administrador.');
  const problem = passwordProblem(password, preview.user.email);
  if (problem) return fail(problem);
  const record = await consumeToken(token, 'INVITE');
  if (!record) return fail('La invitación no es válida o venció. Pide una nueva al administrador.');
  const meta = await requestMeta();
  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), passwordChangedAt: new Date() },
  });
  await audit({ actorId: record.userId, actorRole: record.user.role, action: 'auth.invite_accepted', entity: 'User', entityId: record.userId, ipHash: meta.ipHash });
  await createSession(record.userId, meta, false);
  redirect('/ingresar/configurar-mfa');
}

export async function verifyEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const record = await consumeToken(String(formData.get('token') ?? ''), 'EMAIL_VERIFY');
  if (!record) return fail('El enlace no es válido o ya venció. Intenta ingresar y te enviaremos uno nuevo.');
  await getPrisma().user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: record.userId, actorRole: record.user.role, action: 'auth.email_verified', entity: 'User', entityId: record.userId });
  return ok('¡Listo! Tu correo quedó confirmado. Ya puedes ingresar.');
}

// ── Registro de clientes ─────────────────────────────────────────────────

const registerSchema = z.object({
  firstName: z.string().trim().min(2, 'Escribe tu nombre.').max(120),
  lastName: z.string().trim().min(2, 'Escribe tus apellidos.').max(120),
  documentType: z.enum(['CC', 'CE', 'PA', 'PPT'], { error: 'Elige el tipo de documento.' }),
  documentNumber: z.string().trim().regex(/^[0-9A-Za-z.\- ]{4,20}$/, 'Número de documento inválido.'),
  email: z.email('Escribe un correo válido.').max(320).transform((v) => v.trim().toLowerCase()),
  phone: z.string().trim().regex(/^[+()\d\s.-]{7,20}$/, 'Teléfono inválido.'),
  city: z.string().trim().max(120).optional(),
  password: z.string(),
  confirm: z.string(),
  TRATAMIENTO: z.literal('on', { error: 'Debes autorizar el tratamiento de tus datos para crear la cuenta.' }),
  ENTIDADES: z.string().optional(),
  CENTRALES: z.string().optional(),
  COMUNICACIONES: z.string().optional(),
  website: z.string().max(0).optional(),
});

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
  const data = parsed.data;
  if (data.password !== data.confirm) return fail('Las contraseñas no coinciden.');
  const problem = passwordProblem(data.password, data.email);
  if (problem) return fail(problem);

  const meta = await requestMeta();
  if (await tooManyAttempts([`register:${meta.ipHash ?? 'none'}`], 5, 60 * 60 * 1_000)) {
    return fail('Demasiados registros desde esta conexión. Inténtalo más tarde.');
  }
  await recordAttempt([`register:${meta.ipHash ?? 'none'}`], false);

  const neutral = ok('Revisa tu correo: te enviamos un enlace para confirmar tu cuenta. Si ya tenías cuenta, usa "Olvidé mi contraseña".');
  const prisma = getPrisma();
  const docIndex = blindIndex('doc', normalizeDocument(data.documentType, data.documentNumber));
  const [existingUser, existingPerson] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email } }),
    prisma.person.findUnique({ where: { documentIndex: docIndex } }),
  ]);
  // Respuesta neutra: no revelamos si un correo o documento ya existe.
  if (existingUser || existingPerson?.userId) return neutral;
  // Un expediente creado por un aliado solo se vincula si el correo coincide
  // (y luego se confirma): así nadie reclama un expediente ajeno con una cédula.
  if (existingPerson && existingPerson.email?.toLowerCase() !== data.email) {
    await audit({ action: 'auth.register_document_conflict', entity: 'Person', entityId: existingPerson.id, ipHash: meta.ipHash });
    return fail('Ya existe un expediente con ese documento. Escríbenos a contacto@viis.app para vincularlo de forma segura.');
  }

  const passwordHash = await hashPassword(data.password);
  const normalizedNumber = data.documentNumber.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const accepted = CONSENT_PURPOSES.filter((p) => p.required || formData.get(p.code) === 'on').map((p) => p.code);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: data.email, name: `${data.firstName} ${data.lastName}`, role: 'CLIENT', passwordHash, passwordChangedAt: new Date() },
    });
    // Si un aliado o asesor ya había creado el expediente, se vincula en vez de duplicarlo.
    const person = existingPerson
      ? await tx.person.update({ where: { id: existingPerson.id }, data: { userId: created.id, email: data.email } })
      : await tx.person.create({
          data: {
            userId: created.id,
            documentType: data.documentType,
            documentNumEnc: encryptText(normalizedNumber),
            documentIndex: docIndex,
            documentLast4: normalizedNumber.slice(-4),
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phoneEnc: encryptText(data.phone),
            city: data.city || null,
          },
        });
    await tx.consent.createMany({
      data: consentRecords(person.id, accepted, { channel: `${await requestChannel()}_registro`, ipHash: meta.ipHash, userAgent: meta.userAgent }),
    });
    await audit({ actorId: created.id, actorRole: 'CLIENT', action: 'auth.registered', entity: 'User', entityId: created.id, after: { consents: accepted, linkedExistingPerson: Boolean(existingPerson) }, ipHash: meta.ipHash }, tx);
    return created;
  });
  await sendVerification(user);
  return neutral;
}
