import type { Prisma } from '@/app/generated/prisma/client';
import type { Priority, Stage } from '@/app/generated/prisma/enums';
import { sp, spEnum, spUuid, type SearchParams } from '@/lib/empresa/params';
import { PRIORITY_LABELS, PRODUCTS, STAGE_LABELS, STAGES, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { can, caseScope } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import type { BandejaFilters, BandejaResponse, CaseChannel, CaseRow } from '@/lib/movil/contract-empresa';
import { channelLabel, entityOptions, fullName, options, pageInfo, pageParam, priorityLabel, productLabel, slaView, staffOptions, stageLabel } from './common';

const PAGE_SIZE = 25;
const CLOSED: Stage[] = ['WITHDRAWN', 'DISBURSED', 'POSTSALE'];
const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const CHANNELS = ['DIRECTO', 'ALIADO', 'WEB'] as const;

/** Misma consulta y orden que `/empresa/bandeja`: primero CRITICAL/HIGH por SLA, luego el resto por SLA. */
export async function bandeja(session: CurrentSession, params: SearchParams): Promise<BandejaResponse> {
  const prisma = getPrisma();
  const filters: BandejaFilters = {
    etapa: spEnum(params, 'etapa', STAGES),
    producto: spEnum(params, 'producto', Object.keys(PRODUCTS)),
    responsable: sp(params, 'responsable') === 'none' ? 'none' : spUuid(params, 'responsable'),
    entidad: spUuid(params, 'entidad'),
    canal: spEnum(params, 'canal', CHANNELS),
    prioridad: spEnum(params, 'prioridad', PRIORITIES),
    vencidos: sp(params, 'vencidos') === '1' ? '1' : '',
    q: sp(params, 'q').slice(0, 80),
  };
  const page = pageParam(params);
  const now = new Date();

  const and: Prisma.OpportunityWhereInput[] = [caseScope(session.user)];
  and.push(filters.etapa ? { stage: filters.etapa } : { stage: { notIn: CLOSED } });
  if (filters.producto) and.push({ product: filters.producto });
  if (filters.responsable === 'none') and.push({ assigneeId: null });
  else if (filters.responsable) and.push({ assigneeId: filters.responsable });
  if (filters.entidad) and.push({ entityId: filters.entidad });
  if (filters.canal) and.push({ channel: filters.canal });
  if (filters.prioridad) and.push({ priority: filters.prioridad });
  if (filters.vencidos) and.push({ slaDueAt: { lt: now } });
  if (filters.q) {
    const words = filters.q.split(/\s+/).filter(Boolean).slice(0, 4);
    const or: Prisma.OpportunityWhereInput[] = [{ code: { contains: filters.q, mode: 'insensitive' } }];
    if (/^\d{4}$/.test(filters.q)) or.push({ person: { documentLast4: filters.q } });
    or.push({ AND: words.map((w) => ({ OR: [{ person: { firstName: { contains: w, mode: 'insensitive' as const } } }, { person: { lastName: { contains: w, mode: 'insensitive' as const } } }] })) });
    and.push({ OR: or });
  }
  const where: Prisma.OpportunityWhereInput = { AND: and };
  const urgentWhere: Prisma.OpportunityWhereInput = { AND: [...and, { priority: { in: ['CRITICAL', 'HIGH'] } }] };
  const restWhere: Prisma.OpportunityWhereInput = { AND: [...and, { priority: { in: ['NORMAL', 'LOW'] } }] };

  const [total, urgentTotal, overdueTotal, staff, entities] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.count({ where: urgentWhere }),
    prisma.opportunity.count({ where: { AND: [...and, { slaDueAt: { lt: now } }] } }),
    staffOptions(),
    entityOptions(),
  ]);
  const offset = (page - 1) * PAGE_SIZE;
  const include = {
    person: { select: { firstName: true, lastName: true, documentLast4: true } },
    assignee: { select: { id: true, name: true } },
    entity: { select: { id: true, name: true } },
    allyOrg: { select: { name: true } },
  } satisfies Prisma.OpportunityInclude;
  const urgentTake = Math.max(0, Math.min(PAGE_SIZE, urgentTotal - offset));
  const [urgent, rest] = await Promise.all([
    urgentTake > 0
      ? prisma.opportunity.findMany({ where: urgentWhere, include, orderBy: [{ priority: 'desc' }, { slaDueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], skip: offset, take: urgentTake })
      : Promise.resolve([]),
    PAGE_SIZE - urgentTake > 0
      ? prisma.opportunity.findMany({ where: restWhere, include, orderBy: [{ slaDueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], skip: Math.max(0, offset - urgentTotal), take: PAGE_SIZE - urgentTake })
      : Promise.resolve([]),
  ]);

  const openScope = { AND: [caseScope(session.user), { stage: { notIn: CLOSED } }] };
  const [load, overdueLoad] = await Promise.all([
    prisma.opportunity.groupBy({ by: ['assigneeId'], where: openScope, _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ['assigneeId'], where: { AND: [openScope, { slaDueAt: { lt: now } }] }, _count: { _all: true } }),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const canStage = can(session.user.role, 'case.stage');
  const nowMs = now.getTime();

  const rows: CaseRow[] = [...urgent, ...rest].map((o) => ({
    id: o.id,
    code: o.code,
    client: { name: fullName(o.person), documentLast4: o.person.documentLast4 },
    product: productLabel(o.product),
    nextAction: o.nextAction,
    stage: stageLabel(o.stage),
    stageAt: o.stageAt.toISOString(),
    priority: priorityLabel(o.priority),
    escalatedAt: o.escalatedAt?.toISOString() ?? null,
    assignee: o.assignee ? { id: o.assignee.id, name: o.assignee.name } : null,
    sla: slaView(o.slaDueAt, nowMs) ?? { dueAt: null, overdue: false, text: 'Sin SLA', tone: 'ok' },
    entity: o.entity ? { id: o.entity.id, name: o.entity.name } : null,
    channel: channelLabel(o.channel),
    allyOrgName: o.allyOrg?.name ?? null,
    amount: o.amount === null ? null : toNumber(o.amount),
    canTake: canStage && !o.assigneeId,
  }));

  return {
    ok: true,
    scopeNote: session.user.role === 'ADVISOR' ? 'Ves tus casos y los que no tienen responsable.' : null,
    filters,
    page: pageInfo(page, PAGE_SIZE, total),
    counts: { total, urgent: urgentTotal, overdue: overdueTotal },
    rows,
    load: load
      .map((l) => ({
        assigneeId: l.assigneeId,
        name: l.assigneeId ? staffName.get(l.assigneeId) ?? 'Usuario inactivo' : 'Sin responsable',
        open: l._count._all,
        overdue: overdueLoad.find((x) => x.assigneeId === l.assigneeId)?._count._all ?? 0,
      }))
      .sort((a, b) => b.open - a.open),
    options: {
      stages: STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
      priorities: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p].label })),
      products: options(PRODUCTS),
      channels: CHANNELS.map((c) => ({ value: c as CaseChannel, label: channelLabel(c).label })),
      entities,
      staff,
    },
    can: { assign: can(session.user.role, 'case.assign'), stage: canStage, create: can(session.user.role, 'case.create') },
  };
}
