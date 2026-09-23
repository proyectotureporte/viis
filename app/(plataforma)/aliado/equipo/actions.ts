'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, ok, UserError, zId, zOptMoney, zText } from '@/lib/actions';
import { allyAction, isAllyAdmin, scopedCase } from '@/lib/aliado/scope';
import { enqueueEmail, notify } from '@/lib/jobs';
import { appUrl } from '@/lib/mail';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { randomToken, sha256 } from '@/lib/security/crypto';
import { ALLY_ROLES } from '@/lib/security/rbac';

const INVITE_TTL_MS = 72 * 3_600_000;

function requireAdmin(role: Parameters<typeof isAllyAdmin>[0]) {
  if (!isAllyAdmin(role)) throw new UserError('Solo el administrador de la organización puede gestionar el equipo.');
}

export const reassignCaseAction = allyAction(
  'case.assign',
  z.object({ opportunityId: zId, allyUserId: zId }),
  async ({ opportunityId, allyUserId }, { session, meta, orgId }) => {
    requireAdmin(session.user);
    const result = await getPrisma().$transaction(async (tx) => {
      const opportunity = await scopedCase(tx, session.user, opportunityId);
      if (opportunity.allyOrgId !== orgId) throw new UserError('Ese caso no pertenece a tu organización.');
      if (opportunity.allyUserId === allyUserId) throw new UserError('El caso ya está asignado a esa persona.');
      const target = await tx.user.findFirst({ where: { id: allyUserId, organizationId: orgId, role: { in: ALLY_ROLES }, active: true }, select: { id: true, name: true } });
      if (!target) throw new UserError('Elige un aliado activo de tu organización.');
      await tx.opportunity.update({ where: { id: opportunity.id }, data: { allyUserId: target.id } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'case.reassigned', entity: 'Opportunity', entityId: opportunity.id, before: { allyUserId: opportunity.allyUserId }, after: { allyUserId: target.id }, ipHash: meta.ipHash }, tx);
      if (target.id !== session.user.id) {
        await notify({ userId: target.id, title: `Te asignaron el caso ${opportunity.code}`, body: `${opportunity.person.firstName} ${opportunity.person.lastName}. Revisa la ficha y agenda el siguiente contacto.`, href: `/aliado/clientes/${opportunity.id}` }, tx);
      }
      if (opportunity.allyUserId && opportunity.allyUserId !== session.user.id) {
        await notify({ userId: opportunity.allyUserId, title: `El caso ${opportunity.code} fue reasignado`, body: `Ahora lo gestiona ${target.name}.`, href: '/aliado/clientes' }, tx);
      }
      return { code: opportunity.code, name: target.name };
    });
    revalidatePath('/aliado', 'layout');
    return ok(`${result.code} ahora lo gestiona ${result.name}.`);
  },
);

export const inviteAllyAction = allyAction(
  'case.assign',
  z.object({
    name: zText(160, 3, 'Escribe el nombre completo.'),
    email: z.string().trim().toLowerCase().max(320).pipe(z.email('Correo electrónico inválido.')),
  }),
  async ({ name, email }, { session, meta, orgId }) => {
    requireAdmin(session.user);
    const prisma = getPrisma();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return fail('Ese correo ya tiene una cuenta en OpenV. Si pertenece a tu equipo, pide a OpenV que la vincule a tu organización.');
    }
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true, active: true } });
      if (!org.active) throw new UserError('Tu organización está inactiva; no puede invitar usuarios.');
      const user = await tx.user.create({ data: { email, name, role: 'ALLY', organizationId: orgId } });
      const token = randomToken();
      await tx.authToken.create({ data: { userId: user.id, purpose: 'INVITE', tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) } });
      await enqueueEmail(
        {
          to: email,
          subject: `${org.name} te invitó a OpenV`,
          title: `Hola ${name.split(' ')[0]}, activa tu cuenta de aliado OpenV`,
          paragraphs: [
            `${session.user.name} te invitó a trabajar con ${org.name} en OpenV.`,
            'Crea tu contraseña y configura la verificación en dos pasos. Antes de radicar casos deberás aprobar los cursos obligatorios de la Academia. El enlace vence en 72 horas.',
          ],
          cta: { label: 'Activar mi cuenta', href: appUrl(`/invitacion/${token}`) },
        },
        tx,
      );
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'user.invited', entity: 'User', entityId: user.id, after: { email, role: 'ALLY', organizationId: orgId }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath('/aliado/equipo');
    return ok(`Invitación enviada a ${email}. Vence en 72 horas.`);
  },
);

export const setGoalAction = allyAction('case.assign', z.object({ monthlyGoal: zOptMoney }), async ({ monthlyGoal }, { session, meta, orgId }) => {
  requireAdmin(session.user);
  await getPrisma().$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { monthlyGoal: true } });
    const next = monthlyGoal ? BigInt(Math.round(monthlyGoal)) : null;
    await tx.organization.update({ where: { id: orgId }, data: { monthlyGoal: next } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'organization.goal_changed', entity: 'Organization', entityId: orgId, before: { monthlyGoal: org.monthlyGoal }, after: { monthlyGoal: next }, ipHash: meta.ipHash }, tx);
  });
  revalidatePath('/aliado', 'layout');
  return ok(monthlyGoal ? 'Meta mensual actualizada.' : 'Meta mensual eliminada.');
});
