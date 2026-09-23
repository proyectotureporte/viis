'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import type { Role } from '@/app/generated/prisma/enums';
import { ok, secureAction, UserError, zId, zText } from '@/lib/actions';
import { inviteNewUser, revokeAllSessions, sendInvitation } from '@/lib/empresa/users';
import { enqueueEmail } from '@/lib/jobs';
import { appUrl } from '@/lib/mail';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/security/rbac';

type Tx = Prisma.TransactionClient;

const zStaffRole = z.enum(STAFF_ROLES as [Role, ...Role[]], { error: 'Elige un rol interno.' });

function done(message: string) {
  revalidatePath('/empresa/usuarios');
  return ok(message);
}

async function staffTarget(tx: Tx, id: string) {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user || !STAFF_ROLES.includes(user.role)) throw new UserError('El usuario no existe o no es interno.');
  return user;
}

/** Siempre debe quedar al menos un administrador activo. */
async function assertAnotherAdmin(tx: Tx, excludingId: string) {
  const others = await tx.user.count({ where: { role: 'ADMIN', active: true, id: { not: excludingId } } });
  if (others === 0) throw new UserError('Debe quedar al menos un administrador activo. Asigna otro administrador antes de este cambio.');
}

export const inviteStaffAction = secureAction(
  'user.manage',
  z.object({
    email: z.email('Escribe un correo válido.').max(320),
    name: zText(160, 3, 'Escribe el nombre completo.'),
    role: zStaffRole,
  }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const openv = await tx.organization.findFirst({ where: { kind: 'OPENV' }, select: { id: true } });
      if (!openv) throw new UserError('Falta la organización OpenV en la base de datos.');
      await inviteNewUser(tx, { email: input.email, name: input.name, role: input.role, organizationId: openv.id }, { actor: session.user, meta }, 'OpenV');
    });
    return done(`Invitación enviada a ${input.email.toLowerCase()} como ${ROLE_LABELS[input.role]}. Vence en 72 horas.`);
  },
);

export const changeRoleAction = secureAction('user.manage', z.object({ id: zId, role: zStaffRole }), async (input, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    const user = await staffTarget(tx, input.id);
    if (user.role === input.role) throw new UserError('El usuario ya tiene ese rol.');
    if (user.role === 'ADMIN') {
      if (user.id === session.user.id) throw new UserError('No puedes quitarte a ti mismo el rol de administrador.');
      if (user.active) await assertAnotherAdmin(tx, user.id);
    }
    await tx.user.update({ where: { id: user.id }, data: { role: input.role } });
    // Los permisos cambian: se cierran sus sesiones para que ingrese con el rol nuevo.
    const closed = await revokeAllSessions(tx, user.id);
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'user.role_changed', entity: 'User', entityId: user.id, before: { role: user.role }, after: { role: input.role, sessionsRevoked: closed }, ipHash: meta.ipHash }, tx);
  });
  return done(`Rol actualizado a ${ROLE_LABELS[input.role]}. Se cerraron sus sesiones abiertas.`);
});

export const setActiveAction = secureAction(
  'user.manage',
  z.object({ id: zId, active: z.enum(['0', '1']), reason: z.string().trim().max(300).optional() }),
  async (input, { session, meta }) => {
    const active = input.active === '1';
    await getPrisma().$transaction(async (tx) => {
      const user = await staffTarget(tx, input.id);
      if (user.active === active) throw new UserError(active ? 'El usuario ya está activo.' : 'El usuario ya está desactivado.');
      let closed = 0;
      if (!active) {
        if (user.id === session.user.id) throw new UserError('No puedes desactivar tu propia cuenta.');
        if (!input.reason || input.reason.length < 5) throw new UserError('Indica el motivo de la desactivación (mínimo 5 caracteres).');
        if (user.role === 'ADMIN') await assertAnotherAdmin(tx, user.id);
        closed = await revokeAllSessions(tx, user.id);
      }
      await tx.user.update({ where: { id: user.id }, data: { active } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: active ? 'user.reactivated' : 'user.deactivated', entity: 'User', entityId: user.id, before: { active: user.active }, after: { active, reason: input.reason, sessionsRevoked: closed }, ipHash: meta.ipHash }, tx);
    });
    return done(active ? 'Usuario reactivado.' : 'Usuario desactivado y sesiones cerradas.');
  },
);

export const resendInviteAction = secureAction('user.manage', z.object({ id: zId }), async (input, { session, meta }) => {
  const email = await getPrisma().$transaction(async (tx) => {
    const user = await staffTarget(tx, input.id);
    if (user.passwordHash) throw new UserError('Este usuario ya activó su cuenta; no necesita invitación.');
    if (!user.active) throw new UserError('Reactiva el usuario antes de reenviar la invitación.');
    await sendInvitation(tx, user, { actor: session.user, meta }, 'OpenV');
    return user.email;
  });
  return done(`Invitación reenviada a ${email}. La anterior dejó de funcionar.`);
});

export const resetMfaAction = secureAction(
  'user.manage',
  z.object({ id: zId, reason: zText(300, 10, 'Explica el motivo del restablecimiento (mínimo 10 caracteres).') }),
  async (input, { session, meta }) => {
    const email = await getPrisma().$transaction(async (tx) => {
      const user = await staffTarget(tx, input.id);
      if (user.id === session.user.id) throw new UserError('No puedes restablecer tu propio segundo factor desde aquí. Usa Mi cuenta o pide a otro administrador.');
      if (!user.totpEnabledAt && !user.totpSecretEnc) throw new UserError('Este usuario no tiene verificación en dos pasos configurada.');
      await tx.user.update({ where: { id: user.id }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastCounter: null, recoveryCodes: [] } });
      const closed = await revokeAllSessions(tx, user.id);
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'user.mfa_reset', entity: 'User', entityId: user.id, before: { totpEnabled: Boolean(user.totpEnabledAt) }, after: { totpEnabled: false, reason: input.reason, sessionsRevoked: closed }, ipHash: meta.ipHash }, tx);
      await enqueueEmail({
        to: user.email,
        subject: 'Restablecimos tu verificación en dos pasos de OpenV',
        title: 'Tu verificación en dos pasos fue restablecida',
        paragraphs: [
          `Un administrador de OpenV restableció tu segundo factor. Motivo registrado: ${input.reason}`,
          'Cerramos todas tus sesiones. La próxima vez que ingreses deberás configurar de nuevo la verificación en dos pasos con tu aplicación autenticadora.',
          'Si no solicitaste este cambio, avisa de inmediato a soporte@viis.app.',
        ],
        cta: { label: 'Ingresar a OpenV', href: appUrl('/ingresar') },
      }, tx);
      return user.email;
    });
    return done(`Segundo factor restablecido. Avisamos por correo a ${email}.`);
  },
);

export const revokeUserSessionAction = secureAction('user.manage', z.object({ sessionId: zId }), async (input, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    const target = await tx.session.findUnique({ where: { id: input.sessionId }, include: { user: { select: { id: true, role: true } } } });
    if (!target || !STAFF_ROLES.includes(target.user.role)) throw new UserError('La sesión no existe.');
    if (target.revokedAt) throw new UserError('La sesión ya estaba cerrada.');
    if (target.id === session.id) throw new UserError('Esta es tu sesión actual; ciérrala desde el menú.');
    await tx.session.update({ where: { id: target.id }, data: { revokedAt: new Date() } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'user.session_revoked', entity: 'Session', entityId: target.id, after: { userId: target.userId }, ipHash: meta.ipHash }, tx);
  });
  return done('Sesión cerrada.');
});
