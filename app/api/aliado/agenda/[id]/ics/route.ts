import { buildIcs } from '@/lib/aliado/export';
import { TASK_KIND_TEXT } from '@/lib/aliado/labels';
import { appUrl } from '@/lib/mail';
import { getPrisma } from '@/lib/prisma';
import { ALLY_ROLES, can } from '@/lib/security/rbac';
import { getSession } from '@/lib/security/session';

export const dynamic = 'force-dynamic';

const DURATION_MIN: Record<string, number> = { CITA: 60, LLAMADA: 15, TAREA: 30 };

/** Exporta una actividad propia a iCalendar. Solo el responsable de la tarea puede descargarla. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.mfaPassed || !session.user.totpEnabled) return new Response('Sesión no válida.', { status: 401 });
  if (!ALLY_ROLES.includes(session.user.role) || !can(session.user.role, 'case.note')) return new Response('No autorizado.', { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado.', { status: 404 });

  const task = await getPrisma().task.findFirst({
    where: { id, assigneeId: session.user.id },
    include: { opportunity: { select: { id: true, code: true } } },
  });
  if (!task) return new Response('No encontrado.', { status: 404 });

  const body = buildIcs({
    uid: task.id,
    start: task.dueAt,
    minutes: DURATION_MIN[task.kind] ?? 30,
    title: `${TASK_KIND_TEXT[task.kind] ?? 'Actividad'}: ${task.title}`,
    description: [task.detail, task.opportunity ? `Caso ${task.opportunity.code}` : null].filter(Boolean).join('\n') || undefined,
    url: task.opportunity ? appUrl(`/aliado/clientes/${task.opportunity.id}`) : appUrl('/aliado/agenda'),
    stamp: task.createdAt,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="openv-${task.kind.toLowerCase()}-${task.id.slice(0, 8)}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
