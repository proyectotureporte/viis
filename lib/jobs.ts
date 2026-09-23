import type { Prisma } from '@/app/generated/prisma/client';
import type { EmailMessage } from './mail';
import { getPrisma } from './prisma';

type Tx = Prisma.TransactionClient;

/** Encola un correo en la misma transacción del cambio que lo origina (patrón outbox). */
export async function enqueueEmail(message: EmailMessage, tx?: Tx): Promise<void> {
  await (tx ?? getPrisma()).job.create({
    data: { kind: 'email', payload: message as unknown as Prisma.InputJsonValue },
  });
}

export async function notify(
  input: { userId: string; title: string; body: string; href?: string; email?: { to: string; ctaLabel?: string } },
  tx?: Tx,
): Promise<void> {
  const db = tx ?? getPrisma();
  await db.notification.create({
    data: { userId: input.userId, title: input.title, body: input.body, href: input.href },
  });
  if (input.email) {
    const { appUrl } = await import('./mail');
    await enqueueEmail(
      {
        to: input.email.to,
        subject: input.title,
        title: input.title,
        paragraphs: [input.body],
        cta: input.href ? { label: input.email.ctaLabel ?? 'Ver en OpenV', href: appUrl(input.href) } : undefined,
      },
      db,
    );
  }
}
