import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

/** Puerta de cada página del portal cliente: sesión + MFA + rol, y el expediente propio (o null). */
export async function clientPage() {
  const session = await requireUser({ portal: 'cliente' });
  const person = await getPrisma().person.findUnique({ where: { userId: session.user.id } });
  return { session, person };
}
