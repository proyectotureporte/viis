import { createTaskAction } from '@/app/(plataforma)/aliado/agenda/actions';
import { runActionWithId } from '@/lib/movil/actions';
import { aliadoAgenda } from '@/lib/movil/aliado';
import { apiSession, bodyAsForm, handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Vencidas, hoy y próximos 7 días (hora de Bogotá), cerradas recientes y casos para vincular. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'aliado', permission: 'case.note' });
  return json(await aliadoAgenda(session.user));
});

/** Agenda una actividad: { kind: TAREA|CITA|LLAMADA, title, date: 'YYYY-MM-DD', time: 'HH:MM' (Bogotá), detail?, opportunityId? }. */
export const POST = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'aliado', permission: 'case.note' });
  return runActionWithId(createTaskAction, await bodyAsForm(request), async (_r, since) =>
    (await getPrisma().task.findFirst({ where: { assigneeId: session.user.id, createdById: session.user.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id,
  );
});
