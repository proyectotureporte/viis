'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, ok } from '@/lib/actions';
import type { ActionState } from '@/components/ov/forms';
import { CONSENT_PURPOSES, consentRecords } from '@/lib/consent';
import { enqueueEmail } from '@/lib/jobs';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { sha256 } from '@/lib/security/crypto';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/security/password';
import { requestMeta } from '@/lib/security/request';
import { requireUser } from '@/lib/security/session';
import { generateRecoveryCodes } from '@/lib/security/totp';

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('password') ?? '');
  if (next !== String(formData.get('confirm') ?? '')) return fail('Las contraseñas nuevas no coinciden.');
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!(await verifyPassword(current, user.passwordHash))) return fail('La contraseña actual no es correcta.');
  const problem = passwordProblem(next, user.email);
  if (problem) return fail(problem);
  const meta = await requestMeta();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: session.id } }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ actorId: user.id, actorRole: user.role, action: 'auth.password_changed', entity: 'User', entityId: user.id, ipHash: meta.ipHash });
  await enqueueEmail({ to: user.email, subject: 'Tu contraseña de OpenV cambió', title: 'Cambiaste tu contraseña', paragraphs: ['Cerramos las demás sesiones abiertas. Si no fuiste tú, contáctanos de inmediato en contacto@viis.app.'] });
  return ok('Contraseña actualizada. Cerramos tus otras sesiones.');
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const session = await requireUser();
  const id = z.string().uuid().parse(formData.get('id'));
  const prisma = getPrisma();
  const target = await prisma.session.findFirst({ where: { id, userId: session.user.id } });
  if (!target) return;
  await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'auth.session_revoked', entity: 'Session', entityId: id });
  revalidatePath('/cuenta');
}

export async function revokeAllSessionsAction(): Promise<void> {
  const session = await requireUser();
  await getPrisma().session.updateMany({ where: { userId: session.user.id, revokedAt: null, id: { not: session.id } }, data: { revokedAt: new Date() } });
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'auth.sessions_revoked_all', entity: 'User', entityId: session.user.id });
  revalidatePath('/cuenta');
}

export type CodesState = (ActionState & { codes?: string[] }) | null;

export async function regenerateCodesAction(_prev: CodesState, formData: FormData): Promise<CodesState> {
  const session = await requireUser();
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!(await verifyPassword(String(formData.get('current') ?? ''), user.passwordHash))) return fail('La contraseña no es correcta.');
  const codes = generateRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: codes.map((c) => sha256(c)) } });
  await audit({ actorId: user.id, actorRole: user.role, action: 'auth.recovery_codes_regenerated', entity: 'User', entityId: user.id });
  return { ok: true, message: 'Nuevos códigos generados. Los anteriores dejaron de funcionar.', codes };
}

export async function consentAction(formData: FormData): Promise<void> {
  const session = await requireUser({ portal: 'cliente' });
  const code = z.enum(CONSENT_PURPOSES.map((p) => p.code) as [string, ...string[]]).parse(formData.get('purpose'));
  const grant = formData.get('grant') === '1';
  const purpose = CONSENT_PURPOSES.find((p) => p.code === code)!;
  if (purpose.required && !grant) {
    throw new Error('La autorización de tratamiento es necesaria para mantener la cuenta. Para suprimir tus datos usa una solicitud de habeas data.');
  }
  const prisma = getPrisma();
  const person = await prisma.person.findUniqueOrThrow({ where: { userId: session.user.id } });
  const meta = await requestMeta();
  if (grant) {
    await prisma.consent.createMany({ data: consentRecords(person.id, [code], { channel: 'web_cuenta', ipHash: meta.ipHash, userAgent: meta.userAgent }) });
  } else {
    await prisma.consent.updateMany({ where: { personId: person.id, purpose: code, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: session.user.id } });
  }
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: grant ? 'consent.granted' : 'consent.revoked', entity: 'Person', entityId: person.id, after: { purpose: code }, ipHash: meta.ipHash });
  revalidatePath('/cuenta');
}

export async function markNotificationsReadAction(): Promise<void> {
  const session = await requireUser();
  await getPrisma().notification.updateMany({ where: { userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath('/cuenta/notificaciones');
}
