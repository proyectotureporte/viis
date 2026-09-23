import { Prisma } from '@/app/generated/prisma/client';
import type { Stage } from '@/app/generated/prisma/enums';
import { NAV } from '@/components/ov/nav';
import { bogotaMonthStart, monthLabel } from '@/lib/empresa/params';
import { PIPELINE_STAGES, STAGE_LABELS, STAGE_SLA_HOURS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { can, caseScope, ROLE_PERMISSIONS } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import type { AreaKey, CaseChannel, MenuArea, MenuResponse, OperacionResponse, Permission, Role } from '@/lib/movil/contract-empresa';
import { fullName, plainLabel, priorityLabel, roleLabel, slaView, stageLabel } from './common';

const CLOSED: Stage[] = ['WITHDRAWN', 'DISBURSED', 'POSTSALE'];
const CHANNEL_LABELS: Record<string, string> = { DIRECTO: 'Directo (asesores)', ALIADO: 'Aliados', WEB: 'Web' };
export const TASK_KINDS: Record<string, string> = { TAREA: 'Tarea', LLAMADA: 'Llamada', CITA: 'Cita', SEGUIMIENTO: 'Seguimiento' };
const DAY = 86_400_000;

/** Misma lectura que `/empresa` (centro de operación), respetando el alcance del rol. */
export async function operacion(session: CurrentSession): Promise<OperacionResponse> {
  const prisma = getPrisma();
  const scope = caseScope(session.user);
  const now = new Date();
  const monthStart = bogotaMonthStart(now);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since180 = new Date(now.getTime() - 180 * DAY);
  const soon = new Date(now.getTime() + 8 * 3_600_000);
  const isAdvisor = session.user.role === 'ADVISOR';
  const scopeSql = isAdvisor ? Prisma.sql`AND (o."assigneeId" = ${session.user.id}::uuid OR o."assigneeId" IS NULL)` : Prisma.empty;
  const open = { AND: [scope, { stage: { notIn: CLOSED } }] };

  const [overdue, dueSoon, pipeline, disbursed, filed180, filedDisbursed180, goals, tasks, byChannel, disbursedByChannel, urgentCases, stageDurations, funnelRows] = await Promise.all([
    prisma.opportunity.count({ where: { AND: [open, { slaDueAt: { lt: now } }] } }),
    prisma.opportunity.count({ where: { AND: [open, { slaDueAt: { gte: now, lt: soon } }] } }),
    prisma.opportunity.aggregate({ where: open, _sum: { amount: true }, _count: { _all: true } }),
    prisma.opportunity.aggregate({ where: { AND: [scope, { stages: { some: { to: 'DISBURSED', createdAt: { gte: monthStart } } } }] }, _sum: { disbursedAmount: true }, _count: { _all: true } }),
    prisma.opportunity.count({ where: { AND: [scope, { stages: { some: { to: 'FILED', createdAt: { gte: since180 } } } }] } }),
    prisma.opportunity.count({ where: { AND: [scope, { stages: { some: { to: 'FILED', createdAt: { gte: since180 } } } }, { stages: { some: { to: 'DISBURSED' } } }] } }),
    prisma.organization.aggregate({ where: { active: true, kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } }, _sum: { monthlyGoal: true } }),
    prisma.task.findMany({
      where: { assigneeId: session.user.id, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
      take: 8,
      include: { opportunity: { select: { id: true, code: true, person: { select: { firstName: true, lastName: true } } } } },
    }),
    prisma.opportunity.groupBy({ by: ['channel'], where: open, _count: { _all: true }, _sum: { amount: true } }),
    prisma.opportunity.groupBy({ by: ['channel'], where: { AND: [scope, { stages: { some: { to: 'DISBURSED', createdAt: { gte: monthStart } } } }] }, _count: { _all: true }, _sum: { disbursedAmount: true } }),
    prisma.opportunity.findMany({
      where: { AND: [open, { OR: [{ slaDueAt: { lt: soon } }, { priority: 'CRITICAL' }] }] },
      orderBy: [{ slaDueAt: { sort: 'asc', nulls: 'last' } }],
      take: 6,
      include: { person: { select: { firstName: true, lastName: true } }, assignee: { select: { id: true, name: true } } },
    }),
    prisma.$queryRaw<Array<{ stage: string; hours: number }>>`
      SELECT t."from"::text AS stage, (EXTRACT(EPOCH FROM (t."createdAt" - t.prev_at)) / 3600.0)::float8 AS hours
      FROM (
        SELECT sc."from", sc."createdAt", sc."opportunityId",
               LAG(sc."createdAt") OVER (PARTITION BY sc."opportunityId" ORDER BY sc."createdAt") AS prev_at
        FROM stage_changes sc
      ) t
      JOIN opportunities o ON o.id = t."opportunityId"
      WHERE t."createdAt" >= ${since30} AND t."from" IS NOT NULL AND t.prev_at IS NOT NULL ${scopeSql}`,
    prisma.$queryRaw<Array<{ stage: string; n: number }>>`
      SELECT sc."to"::text AS stage, COUNT(DISTINCT sc."opportunityId")::int AS n
      FROM stage_changes sc JOIN opportunities o ON o.id = sc."opportunityId"
      WHERE sc."createdAt" >= ${monthStart} ${scopeSql}
      GROUP BY sc."to"`,
  ]);

  const withSla = stageDurations.filter((d) => STAGE_SLA_HOURS[d.stage as Stage] !== undefined);
  const slaMet = withSla.filter((d) => d.hours <= (STAGE_SLA_HOURS[d.stage as Stage] ?? 0)).length;
  const disbursedSum = toNumber(disbursed._sum.disbursedAmount);
  const goal = toNumber(goals._sum.monthlyGoal);
  const nowMs = now.getTime();

  return {
    ok: true,
    scopeNote: isAdvisor ? 'Ves tus casos y los que no tienen responsable.' : null,
    monthLabel: monthLabel(now),
    alerts: { overdue, dueSoon, dueSoonHours: 8 },
    kpis: {
      pipeline: { amount: toNumber(pipeline._sum.amount), count: pipeline._count._all },
      disbursedMonth: { amount: disbursedSum, count: disbursed._count._all, allyGoal: goal, goalRatio: goal > 0 ? disbursedSum / goal : null },
      conversion: {
        ratio: filed180 ? filedDisbursed180 / filed180 : null,
        filed: filed180,
        disbursed: filedDisbursed180,
        windowDays: 180,
        definition: 'Casos radicados en los últimos 180 días que llegaron a desembolso.',
      },
      sla: { ratio: withSla.length ? slaMet / withSla.length : null, met: slaMet, closed: withSla.length, windowDays: 30, target: 0.95 },
    },
    urgentCases: urgentCases.map((o) => ({
      id: o.id,
      code: o.code,
      clientName: fullName(o.person),
      stage: stageLabel(o.stage),
      priority: priorityLabel(o.priority),
      assignee: o.assignee ? { id: o.assignee.id, name: o.assignee.name } : null,
      sla: slaView(o.slaDueAt, nowMs) ?? { dueAt: null, overdue: false, text: 'Sin SLA', tone: 'ok' },
    })),
    myTasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      kind: plainLabel(TASK_KINDS, t.kind, 'info'),
      dueAt: t.dueAt.toISOString(),
      overdue: t.dueAt < now,
      case: t.opportunity ? { id: t.opportunity.id, code: t.opportunity.code, clientName: fullName(t.opportunity.person) } : null,
    })),
    funnel: PIPELINE_STAGES.map((s) => ({ stage: s, label: STAGE_LABELS[s], value: funnelRows.find((r) => r.stage === s)?.n ?? 0 })),
    byChannel: (['DIRECTO', 'ALIADO', 'WEB'] as CaseChannel[]).map((c) => {
      const o = byChannel.find((b) => b.channel === c);
      const d = disbursedByChannel.find((b) => b.channel === c);
      return {
        channel: c,
        label: CHANNEL_LABELS[c],
        open: o?._count._all ?? 0,
        amount: toNumber(o?._sum.amount),
        disbursedMonth: d?._count._all ?? 0,
        disbursedMonthAmount: toNumber(d?._sum.disbursedAmount),
      };
    }),
    can: { readCases: can(session.user.role, 'case.read'), createCase: can(session.user.role, 'case.create') },
  };
}

const ENDPOINTS: Record<AreaKey, string> = {
  operacion: '/empresa/operacion',
  bandeja: '/empresa/bandeja',
  leads: '/empresa/leads',
  clientes: '/empresa/clientes',
  documentos: '/empresa/documentos',
  pagos: '/empresa/pagos',
  solicitudes: '/empresa/solicitudes',
  aliados: '/empresa/aliados',
  comisiones: '/empresa/comisiones',
  analitica: '/empresa/analitica',
  auditoria: '/empresa/auditoria',
  catalogos: '/empresa/catalogos',
  usuarios: '/empresa/usuarios',
};

function areaKey(href: string): AreaKey {
  const key = href.replace(/^\/empresa\/?/, '') || 'operacion';
  return key as AreaKey;
}

/** Áreas visibles para el rol (misma matriz que la barra lateral web) + contadores para badges. */
export async function menu(session: CurrentSession): Promise<MenuResponse> {
  const prisma = getPrisma();
  const role = session.user.role;
  const visible = NAV.empresa.filter((item) => !item.permission || can(role, item.permission));
  const keys = new Set(visible.map((v) => areaKey(v.href)));
  const now = new Date();
  const scope = caseScope(session.user);

  const counters: Partial<Record<AreaKey, Promise<number>>> = {
    operacion: prisma.task.count({ where: { assigneeId: session.user.id, status: 'OPEN', dueAt: { lt: now } } }),
    bandeja: prisma.opportunity.count({ where: { AND: [scope, { stage: { notIn: CLOSED } }, { slaDueAt: { lt: now } }] } }),
    leads: prisma.contactRequest.count({ where: { status: 'NEW' } }),
    documentos: prisma.document.count({ where: { status: { in: ['UPLOADED', 'IN_REVIEW'] }, payment: { is: null } } }),
    pagos: prisma.paymentReport.count({ where: { status: { in: ['REPORTED', 'IN_REVIEW'] } } }),
    solicitudes: prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] }, slaDueAt: { lt: now } } }),
    comisiones: prisma.commission.count({ where: { status: 'CAUSED' } }),
  };
  const hints: Partial<Record<AreaKey, string>> = {
    operacion: 'Tus tareas vencidas',
    bandeja: 'Casos con SLA vencido en tu alcance',
    leads: 'Leads por gestionar',
    documentos: 'Documentos pendientes de revisión',
    pagos: 'Pagos por revisar',
    solicitudes: 'Solicitudes abiertas con SLA vencido',
    comisiones: 'Comisiones causadas por aprobar',
  };
  const entries = await Promise.all(
    [...keys].map(async (k) => [k, counters[k] ? await counters[k] : null] as const),
  );
  const badge = new Map(entries);
  const unreadNotifications = await prisma.notification.count({ where: { userId: session.user.id, readAt: null } });

  const areas: MenuArea[] = visible.map((item) => {
    const key = areaKey(item.href);
    return {
      key,
      label: item.label,
      icon: item.icon,
      group: item.group ?? 'Operación',
      permission: (item.permission ?? null) as Permission | null,
      mobile: Boolean(item.mobile),
      endpoint: ENDPOINTS[key],
      badge: badge.get(key) ?? null,
      badgeHint: hints[key] ?? null,
    };
  });

  return {
    ok: true,
    user: { id: session.user.id, name: session.user.name, email: session.user.email, role: role as Role, roleLabel: roleLabel(role) },
    permissions: [...ROLE_PERMISSIONS[role]] as Permission[],
    areas,
    unreadNotifications,
  };
}
