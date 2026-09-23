import type { Prisma } from '@/app/generated/prisma/client';
import type { Role } from '@/app/generated/prisma/enums';
import { UserError } from '@/lib/actions';
import { enqueueEmail } from '@/lib/jobs';
import { appUrl } from '@/lib/mail';
import { audit } from '@/lib/security/audit';
import { randomToken, sha256 } from '@/lib/security/crypto';
import { ROLE_LABELS } from '@/lib/security/rbac';
import type { ActionCtx } from './access';

type Tx = Prisma.TransactionClient;

export const INVITE_HOURS = 72;

/** Crea un token de invitación (72 h), invalida los anteriores y encola el correo. */
export async function sendInvitation(tx: Tx, user: { id: string; email: string; name: string; role: Role }, ctx: ActionCtx, orgName?: string): Promise<void> {
  const now = new Date();
  await tx.authToken.updateMany({ where: { userId: user.id, purpose: 'INVITE', usedAt: null }, data: { usedAt: now } });
  const token = randomToken();
  await tx.authToken.create({ data: { userId: user.id, purpose: 'INVITE', tokenHash: sha256(token), expiresAt: new Date(now.getTime() + INVITE_HOURS * 3_600_000) } });
  await enqueueEmail({
    to: user.email,
    subject: 'Te invitaron a OpenV',
    title: `Hola ${user.name.split(' ')[0]}, activa tu cuenta OpenV`,
    paragraphs: [
      `Te dieron acceso como ${ROLE_LABELS[user.role]}${orgName ? ` de ${orgName}` : ''}.`,
      `Crea tu contraseña y configura la verificación en dos pasos. El enlace vence en ${INVITE_HOURS} horas.`,
    ],
    cta: { label: 'Activar mi cuenta', href: appUrl(`/invitacion/${token}`) },
  }, tx);
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'user.invitation_sent', entity: 'User', entityId: user.id, after: { email: user.email, role: user.role }, ipHash: ctx.meta.ipHash }, tx);
}

/** Alta de usuario invitado. Falla si el correo ya existe (no se "roba" una cuenta ajena). */
export async function inviteNewUser(
  tx: Tx,
  input: { email: string; name: string; role: Role; organizationId: string | null },
  ctx: ActionCtx,
  orgName?: string,
): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const exists = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw new UserError('Ya existe un usuario con ese correo.');
  const user = await tx.user.create({ data: { email, name: input.name.trim(), role: input.role, organizationId: input.organizationId } });
  await audit({ actorId: ctx.actor.id, actorRole: ctx.actor.role, action: 'user.invited', entity: 'User', entityId: user.id, after: { email, role: input.role, organizationId: input.organizationId }, ipHash: ctx.meta.ipHash }, tx);
  await sendInvitation(tx, user, ctx, orgName);
  return user.id;
}

export async function revokeAllSessions(tx: Tx, userId: string): Promise<number> {
  const result = await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count;
}
