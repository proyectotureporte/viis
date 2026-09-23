'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import { ok, secureAction, UserError, zCheckbox, zId, zOptMoney, zOptText, zText } from '@/lib/actions';
import { inviteNewUser, revokeAllSessions, sendInvitation } from '@/lib/empresa/users';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

const ALLY_KINDS = ['ALLY_PERSON', 'ALLY_COMPANY'] as const;

const orgFields = {
  kind: z.enum(ALLY_KINDS, { error: 'Elige el tipo de aliado.' }),
  name: zText(160, 2, 'Escribe el nombre del aliado.'),
  taxId: zOptText(40),
  territory: zOptText(160),
  tier: z.string().trim().min(2, 'Indica el nivel.').max(24).regex(/^[A-Za-z0-9_ÁÉÍÓÚÑáéíóúñ-]+$/, 'El nivel debe ser una palabra corta (ej.: BASE, PLATA, ORO).').transform((v) => v.toUpperCase()),
  monthlyGoal: zOptMoney,
  active: zCheckbox,
};

export const createAllyAction = secureAction('ally.manage', z.object(orgFields), async (input, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    if (input.taxId) {
      const dup = await tx.organization.findFirst({ where: { taxId: input.taxId }, select: { name: true } });
      if (dup) throw new UserError(`Ya existe una organización con ese NIT (${dup.name}).`);
    }
    const org = await tx.organization.create({
      data: {
        kind: input.kind,
        name: input.name,
        taxId: input.taxId ?? null,
        territory: input.territory ?? null,
        tier: input.tier,
        monthlyGoal: input.monthlyGoal !== undefined ? BigInt(input.monthlyGoal) : null,
        active: input.active,
      },
    });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'ally.created', entity: 'Organization', entityId: org.id, after: input, ipHash: meta.ipHash }, tx);
  });
  revalidatePath('/empresa/aliados');
  return ok('Aliado creado. Ahora invita a sus usuarios desde su ficha.');
});

export const updateAllyAction = secureAction('ally.manage', z.object({ id: zId, ...orgFields }), async ({ id, ...input }, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    const org = await tx.organization.findFirst({ where: { id, kind: { in: [...ALLY_KINDS] } } });
    if (!org) throw new UserError('El aliado no existe.');
    if (input.taxId && input.taxId !== org.taxId) {
      const dup = await tx.organization.findFirst({ where: { taxId: input.taxId, id: { not: id } }, select: { name: true } });
      if (dup) throw new UserError(`Ya existe una organización con ese NIT (${dup.name}).`);
    }
    const updated = await tx.organization.update({
      where: { id },
      data: {
        kind: input.kind,
        name: input.name,
        taxId: input.taxId ?? null,
        territory: input.territory ?? null,
        tier: input.tier,
        monthlyGoal: input.monthlyGoal !== undefined ? BigInt(input.monthlyGoal) : null,
        active: input.active,
      },
    });
    const pick = (o: typeof org) => ({ kind: o.kind, name: o.name, taxId: o.taxId, territory: o.territory, tier: o.tier, monthlyGoal: o.monthlyGoal, active: o.active });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'ally.updated', entity: 'Organization', entityId: id, before: pick(org), after: pick(updated), ipHash: meta.ipHash }, tx);
    if (org.active && !input.active) {
      const users = await tx.user.findMany({ where: { organizationId: id }, select: { id: true } });
      for (const u of users) await revokeAllSessions(tx, u.id);
    }
  });
  revalidatePath('/empresa/aliados');
  revalidatePath(`/empresa/aliados/${id}`);
  return ok(input.active ? 'Datos del aliado actualizados.' : 'Aliado actualizado e inactivado: se cerraron las sesiones de sus usuarios.');
});

export const inviteAllyUserAction = secureAction(
  'ally.manage',
  z.object({
    organizationId: zId,
    name: zText(160, 3, 'Escribe el nombre completo.'),
    email: z.email('Escribe un correo válido.').max(320),
    role: z.enum(['ALLY', 'ALLY_ADMIN'], { error: 'Elige el rol.' }),
  }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: input.organizationId, kind: { in: [...ALLY_KINDS] } } });
      if (!org) throw new UserError('El aliado no existe.');
      if (!org.active) throw new UserError('Activa el aliado antes de invitar usuarios.');
      await inviteNewUser(tx, { email: input.email, name: input.name, role: input.role, organizationId: org.id }, { actor: session.user, meta }, org.name);
    });
    revalidatePath(`/empresa/aliados/${input.organizationId}`);
    return ok(`Invitación enviada a ${input.email}. Vence en 72 horas.`);
  },
);

async function loadAllyUser(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findFirst({ where: { id: userId, role: { in: ['ALLY', 'ALLY_ADMIN'] } }, include: { organization: true } });
  if (!user || !user.organization) throw new UserError('El usuario aliado no existe.');
  return user;
}

export const resendAllyInviteAction = secureAction('ally.manage', z.object({ userId: zId }), async ({ userId }, { session, meta }) => {
  const orgId = await getPrisma().$transaction(async (tx) => {
    const user = await loadAllyUser(tx, userId);
    if (user.passwordHash) throw new UserError('Este usuario ya activó su cuenta; si olvidó la contraseña puede recuperarla desde el ingreso.');
    if (!user.active) throw new UserError('Reactiva el usuario antes de reenviar la invitación.');
    await sendInvitation(tx, user, { actor: session.user, meta }, user.organization!.name);
    return user.organizationId!;
  });
  revalidatePath(`/empresa/aliados/${orgId}`);
  return ok('Invitación reenviada. La anterior dejó de funcionar.');
});

export const toggleAllyUserAction = secureAction(
  'ally.manage',
  z.object({ userId: zId, active: z.enum(['0', '1']), reason: zOptText(300) }),
  async ({ userId, active, reason }, { session, meta }) => {
    const activate = active === '1';
    if (!activate && (!reason || reason.length < 5)) throw new UserError('Indica el motivo de la desactivación (mínimo 5 caracteres).');
    const orgId = await getPrisma().$transaction(async (tx) => {
      const user = await loadAllyUser(tx, userId);
      if (activate && !user.organization!.active) throw new UserError('El aliado está inactivo; actívalo antes de reactivar a sus usuarios.');
      if (user.active === activate) throw new UserError(activate ? 'El usuario ya está activo.' : 'El usuario ya está inactivo.');
      await tx.user.update({ where: { id: userId }, data: { active: activate } });
      const revoked = activate ? 0 : await revokeAllSessions(tx, userId);
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: activate ? 'user.reactivated' : 'user.deactivated', entity: 'User', entityId: userId, before: { active: user.active }, after: { active: activate, reason, sessionsRevoked: revoked }, ipHash: meta.ipHash }, tx);
      return user.organizationId!;
    });
    revalidatePath(`/empresa/aliados/${orgId}`);
    return ok(activate ? 'Usuario reactivado.' : 'Usuario desactivado y sesiones cerradas. Sus casos siguen en la organización.');
  },
);
