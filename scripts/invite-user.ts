import 'dotenv/config';
import { parseArgs } from 'node:util';
import { Role } from '../app/generated/prisma/enums';
import { enqueueEmail } from '../lib/jobs';
import { appUrl } from '../lib/mail';
import { getPrisma } from '../lib/prisma';
import { audit } from '../lib/security/audit';
import { randomToken, sha256 } from '../lib/security/crypto';

/**
 * Alta de usuarios internos desde el servidor (el primer administrador).
 * Uso: pnpm user:invite --email ana@viis.app --name "Ana Pérez" --role ADMIN
 * Envía la invitación por correo e imprime el enlace (válido 72 h).
 */
async function main() {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'ADMIN' } } });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role as Role;
  if (!email || !name || !(role in Role)) throw new Error('Uso: --email correo --name "Nombre" --role ADMIN|COORDINATOR|…');
  const prisma = getPrisma();
  const openv = await prisma.organization.findFirstOrThrow({ where: { kind: 'OPENV' } });
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role, organizationId: role === 'CLIENT' ? null : openv.id },
    update: {},
  });
  const token = randomToken();
  await prisma.authToken.create({ data: { userId: user.id, purpose: 'INVITE', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 72 * 3_600_000) } });
  const link = appUrl(`/invitacion/${token}`);
  await enqueueEmail({
    to: email,
    subject: 'Te invitaron a OpenV',
    title: `Hola ${name.split(' ')[0]}, activa tu cuenta OpenV`,
    paragraphs: ['Crea tu contraseña y configura la verificación en dos pasos. El enlace vence en 72 horas.'],
    cta: { label: 'Activar mi cuenta', href: link },
  });
  await audit({ action: 'user.invited', entity: 'User', entityId: user.id, after: { email, role }, channel: 'cli' });
  console.log(`Invitación creada para ${email} (${role}).\n${link}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
