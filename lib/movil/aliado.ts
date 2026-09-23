import type { Prisma } from '@/app/generated/prisma/client';
import type { Stage } from '@/app/generated/prisma/enums';
import { MAX_ATTEMPTS_PER_DAY, progressPct, publicQuiz, readLessons } from '@/lib/aliado/academy';
import { BASIS_LABELS, readSnapshot, scopedCommissions } from '@/lib/aliado/commission';
import { TASK_KIND_TEXT, TIER_LABELS } from '@/lib/aliado/labels';
import {
  ACTIVE_STAGES,
  allyCases,
  certState,
  CLOSED_OK,
  commissionScope,
  critical,
  isAllyAdmin,
  latestCertByCourse,
  maskedDocument,
  missingByCase,
  NIL_UUID,
  personName,
} from '@/lib/aliado/scope';
import { addDaysYmd, bogotaDayStart, bogotaMonthStart, bogotaYmd, dayTitle, daysBetween } from '@/lib/aliado/time';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { allyBlockingCertifications, computeCommission, pickRule } from '@/lib/domain/cases';
import { checklist } from '@/lib/domain/documents';
import { COMMISSION_STATUS, DOC_STATUS, DOCUMENT_TYPES_ID, PIPELINE_STAGES, PRODUCTS, STAGE_LABELS, STAGES, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import type { CurrentSession, SessionUser } from '@/lib/security/session';
import { todayBogota } from '@/lib/cliente/format';
import type {
  AliadoAcademiaResponse,
  AliadoAgendaResponse,
  AliadoClientesResponse,
  AliadoComisionesResponse,
  AliadoCursoResponse,
  AliadoEmbudoResponse,
  AliadoFichaResponse,
  AliadoResumenResponse,
  CommissionStatus,
  TaskView,
  Tone,
  UrgentCase,
} from './contract';
import { documentTypeView, INTERACTION_CHANNELS, offerView, TASK_KINDS } from './cliente';
import { ApiError } from './http';
import { day, iso, notificationView, num, slaOf, statusOf } from './util';

type TaskRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  dueAt: Date;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  doneAt: Date | null;
  assigneeId: string;
  opportunity?: { id: string; code: string } | null;
  assignee?: { name: string };
};

export function taskView(t: TaskRow, userId: string): TaskView {
  const mine = t.assigneeId === userId;
  return {
    id: t.id,
    kind: t.kind,
    kindLabel: TASK_KIND_TEXT[t.kind] ?? t.kind,
    title: t.title,
    detail: t.detail,
    dueAt: t.dueAt.toISOString(),
    status: t.status,
    doneAt: iso(t.doneAt),
    opportunity: t.opportunity ? { id: t.opportunity.id, code: t.opportunity.code } : null,
    ...(!mine && t.assignee ? { assigneeName: t.assignee.name } : {}),
    editable: mine && t.status === 'OPEN',
    icsUrl: `/api/aliado/agenda/${t.id}/ics`,
  };
}

function stageTone(stage: Stage): Tone {
  return stage === 'WITHDRAWN' ? 'bad' : CLOSED_OK.includes(stage) ? 'ok' : 'wait';
}

const orgView = (org: { id: string; name: string; tier: string } | null) => (org ? { id: org.id, name: org.name, tier: org.tier, tierLabel: TIER_LABELS[org.tier] ?? org.tier } : null);

// ── GET /aliado/resumen ────────────────────────────────────────────────

export async function aliadoResumen(user: SessionUser): Promise<AliadoResumenResponse> {
  const scope = allyCases(user);
  const prisma = getPrisma();
  const now = new Date();
  const monthStart = bogotaMonthStart(now);
  const tomorrow = bogotaDayStart(addDaysYmd(bogotaYmd(now), 1));
  const soon = new Date(now.getTime() + 24 * 3_600_000);

  const [org, pipeline, disbursedChanges, commissionGroups, stageGroups, urgentSla, docCases, tasks, notices, blocking, courses, certs, nextPayment] = await Promise.all([
    user.organizationId ? prisma.organization.findUnique({ where: { id: user.organizationId } }) : Promise.resolve(null),
    prisma.opportunity.aggregate({ where: { AND: [scope, { stage: { in: ACTIVE_STAGES } }] }, _sum: { amount: true }, _count: true }),
    prisma.stageChange.findMany({ where: { to: 'DISBURSED', createdAt: { gte: monthStart }, opportunity: scope }, select: { opportunity: { select: { id: true, disbursedAmount: true } } } }),
    prisma.commission.groupBy({ by: ['status'], where: commissionScope(user), _sum: { net: true }, _count: true }),
    prisma.opportunity.groupBy({ by: ['stage'], where: scope, _count: true }),
    prisma.opportunity.findMany({
      where: { AND: [scope, { stage: { in: ACTIVE_STAGES } }, { slaDueAt: { lte: soon } }] },
      orderBy: { slaDueAt: 'asc' },
      take: 8,
      include: { person: { select: { firstName: true, lastName: true } } },
    }),
    prisma.opportunity.findMany({
      where: { AND: [scope, { stage: { in: ['CONTACTED', 'PROFILED', 'DOCUMENTING'] } }] },
      orderBy: { stageAt: 'asc' },
      take: 30,
      select: { id: true, code: true, personId: true, product: true, stage: true, stageAt: true, person: { select: { firstName: true, lastName: true } } },
    }),
    prisma.task.findMany({ where: { assigneeId: user.id, status: 'OPEN', dueAt: { lt: tomorrow } }, orderBy: { dueAt: 'asc' }, take: 12, include: { opportunity: { select: { id: true, code: true } } } }),
    prisma.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: 'desc' }, take: 5 }),
    allyBlockingCertifications(prisma, user.id),
    prisma.course.findMany({ where: { active: true, OR: [{ mandatory: true }, { critical: true }] }, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, title: true, critical: true } }),
    prisma.certification.findMany({ where: { userId: user.id }, select: { courseId: true, expiresAt: true } }),
    prisma.commission.findFirst({ where: { ...commissionScope(user), status: { in: ['APPROVED', 'SCHEDULED', 'CAUSED'] } }, orderBy: { expectedPayAt: 'asc' }, select: { expectedPayAt: true } }),
  ]);

  const seen = new Set<string>();
  let disbursedMonth = 0;
  for (const change of disbursedChanges) {
    if (seen.has(change.opportunity.id)) continue;
    seen.add(change.opportunity.id);
    disbursedMonth += toNumber(change.opportunity.disbursedAmount);
  }
  const goal = toNumber(org?.monthlyGoal);
  const sumBy = (...statuses: string[]) => commissionGroups.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + toNumber(g._sum.net), 0);
  const totalCases = stageGroups.reduce((s, g) => s + g._count, 0);
  const won = stageGroups.filter((g) => CLOSED_OK.includes(g.stage)).reduce((s, g) => s + g._count, 0);
  const lost = stageGroups.find((g) => g.stage === 'WITHDRAWN')?._count ?? 0;
  const missing = await missingByCase(prisma, docCases);
  const certByCourse = latestCertByCourse(certs);

  const urgent: UrgentCase[] = urgentSla.map((c) => ({
    id: c.id,
    code: c.code,
    clientName: personName(c.person),
    product: c.product,
    productLabel: PRODUCTS[c.product] ?? c.product,
    stage: c.stage,
    stageLabel: STAGE_LABELS[c.stage],
    reason: 'SLA',
    pending: c.nextAction ?? '—',
    sla: slaOf(c.slaDueAt),
    missingDocuments: [],
  }));
  for (const c of docCases) {
    const faltan = missing.get(c.id) ?? [];
    if (!faltan.length || urgent.some((u) => u.id === c.id) || urgent.filter((u) => u.reason === 'DOCUMENTOS').length >= 8) continue;
    urgent.push({
      id: c.id,
      code: c.code,
      clientName: personName(c.person),
      product: c.product,
      productLabel: PRODUCTS[c.product] ?? c.product,
      stage: c.stage,
      stageLabel: STAGE_LABELS[c.stage],
      reason: 'DOCUMENTOS',
      pending: faltan.length === 1 ? faltan[0] : `${faltan.length} documentos: ${faltan.slice(0, 2).join(', ')}${faltan.length > 2 ? '…' : ''}`,
      sla: null,
      missingDocuments: faltan,
    });
  }

  return {
    ok: true,
    firstName: user.name.split(' ')[0] ?? user.name,
    admin: isAllyAdmin(user),
    organization: orgView(org),
    blocking,
    kpis: {
      pipeline: { amount: toNumber(pipeline._sum.amount), count: pipeline._count },
      disbursedMonth: { amount: disbursedMonth, goal: goal > 0 ? goal : null, goalPct: goal > 0 ? disbursedMonth / goal : null },
      commissions: { caused: sumBy('CAUSED'), approved: sumBy('APPROVED', 'SCHEDULED'), paid: sumBy('PAID'), nextPaymentAt: day(nextPayment?.expectedPayAt) },
      conversion: { total: totalCases, won, lost, rate: totalCases ? won / totalCases : null },
    },
    urgent,
    today: tasks.map((t) => taskView(t, user.id)),
    certifications: courses.map((course) => ({
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      critical: course.critical,
      state: critical(certState(certByCourse.get(course.id)?.expiresAt), course.critical),
    })),
    notices: notices.map(notificationView),
  };
}

// ── GET /aliado/clientes ───────────────────────────────────────────────

const CLIENT_PAGE_SIZE = 50;

function searchFilter(q: string): Prisma.OpportunityWhereInput | undefined {
  const text = q.trim().slice(0, 80);
  if (!text) return undefined;
  if (/^\d{4}$/.test(text)) return { OR: [{ person: { documentLast4: text } }, { code: { contains: text, mode: 'insensitive' } }] };
  if (/^ov-?\d+$/i.test(text)) return { code: { contains: text.toUpperCase().replace(/^OV(\d)/, 'OV-$1'), mode: 'insensitive' } };
  const tokens = text.split(/\s+/).filter(Boolean).slice(0, 4);
  return {
    AND: tokens.map((token) => ({
      OR: [{ person: { firstName: { contains: token, mode: 'insensitive' as const } } }, { person: { lastName: { contains: token, mode: 'insensitive' as const } } }],
    })),
  };
}

export async function aliadoClientes(user: SessionUser, url: URL): Promise<AliadoClientesResponse> {
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  const etapa = url.searchParams.get('etapa');
  const stage = etapa && STAGES.includes(etapa as Stage) ? (etapa as Stage) : undefined;
  const page = Math.max(1, Math.min(200, Number(url.searchParams.get('pagina')) || 1));
  const filter = searchFilter(q);
  const where: Prisma.OpportunityWhereInput = { AND: [allyCases(user), ...(stage ? [{ stage }] : []), ...(filter ? [filter] : [])] };
  const prisma = getPrisma();
  const [total, cases] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * CLIENT_PAGE_SIZE,
      take: CLIENT_PAGE_SIZE,
      include: {
        person: { select: { firstName: true, lastName: true, documentType: true, documentLast4: true } },
        allyUser: { select: { name: true } },
        entity: { select: { name: true } },
      },
    }),
  ]);
  const missing = await missingByCase(
    prisma,
    cases.filter((c) => ['PROFILED', 'DOCUMENTING', 'CONTACTED'].includes(c.stage)),
  );
  const admin = isAllyAdmin(user);
  return {
    ok: true,
    admin,
    total,
    page,
    pageSize: CLIENT_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / CLIENT_PAGE_SIZE)),
    items: cases.map((c) => ({
      id: c.id,
      code: c.code,
      clientName: personName(c.person),
      document: maskedDocument(c.person),
      product: c.product,
      productLabel: PRODUCTS[c.product] ?? c.product,
      entityName: c.entity?.name ?? null,
      stage: c.stage,
      stageLabel: STAGE_LABELS[c.stage],
      stageTone: stageTone(c.stage),
      missingDocuments: missing.get(c.id) ?? [],
      nextAction: c.nextAction,
      sla: ['WITHDRAWN', 'DISBURSED', 'POSTSALE'].includes(c.stage) ? null : slaOf(c.slaDueAt),
      amount: num(c.amount),
      disbursedAmount: num(c.disbursedAmount),
      allyName: admin ? c.allyUser?.name ?? null : null,
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

// ── GET /aliado/clientes/{id} ──────────────────────────────────────────

const CLOSED = ['WITHDRAWN', 'DISBURSED', 'POSTSALE'];
const CHANNEL_LABEL = Object.fromEntries(INTERACTION_CHANNELS.map((c) => [c.code, c.label]));

export async function aliadoFicha(user: SessionUser, id: string): Promise<AliadoFichaResponse> {
  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, ...allyCases(user) },
    include: {
      person: { include: { consents: { where: { revokedAt: null }, orderBy: { grantedAt: 'desc' } } } },
      entity: { select: { name: true } },
      allyUser: { select: { id: true, name: true } },
      allyOrg: { select: { name: true } },
      stages: { orderBy: { createdAt: 'asc' } },
      offers: { orderBy: { createdAt: 'desc' } },
      commissions: { where: { allyOrgId: user.organizationId ?? NIL_UUID } },
    },
  });
  // Fuera del alcance responde igual que si no existiera.
  if (!opportunity) throw new ApiError('No encontramos ese caso en tu cartera.', 404);
  const { person } = opportunity;

  const orgUsers = user.organizationId
    ? await prisma.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } })
    : [{ id: user.id, name: user.name }];
  const orgUserIds = orgUsers.map((u) => u.id);
  const nameOf = (userId: string | null) => orgUsers.find((u) => u.id === userId)?.name ?? 'Equipo OpenV';

  const [items, blocking, interactions, tasks, emailAccount] = await Promise.all([
    checklist(prisma, person.id, opportunity.product),
    opportunity.allyUserId ? allyBlockingCertifications(prisma, opportunity.allyUserId) : Promise.resolve([] as string[]),
    prisma.interaction.findMany({
      where: { opportunityId: opportunity.id, OR: [{ byUserId: { in: orgUserIds } }, { visibleToClient: true }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.task.findMany({
      where: { opportunityId: opportunity.id, assigneeId: { in: orgUserIds } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 50,
      include: { assignee: { select: { name: true } }, opportunity: { select: { id: true, code: true } } },
    }),
    person.email && !person.userId ? prisma.user.findUnique({ where: { email: person.email }, select: { id: true } }) : Promise.resolve(null),
  ]);

  const closed = CLOSED.includes(opportunity.stage);
  const stageIndex = PIPELINE_STAGES.indexOf(opportunity.stage === 'POSTSALE' ? 'DISBURSED' : opportunity.stage);
  const consented = new Set(person.consents.map((c) => c.purpose));
  const commission = opportunity.commissions[0];
  const today = todayBogota();
  const allowedMoves: AliadoFichaResponse['case']['allowedMoves'] = [];
  if (opportunity.stage === 'LEAD') allowedMoves.push('CONTACTED');
  if (opportunity.stage === 'CONTACTED') allowedMoves.push('PROFILED');
  if (!closed) allowedMoves.push('WITHDRAWN');

  return {
    ok: true,
    case: {
      id: opportunity.id,
      code: opportunity.code,
      product: opportunity.product,
      productLabel: PRODUCTS[opportunity.product] ?? opportunity.product,
      stage: opportunity.stage,
      stageLabel: STAGE_LABELS[opportunity.stage],
      closed,
      pipeline: PIPELINE_STAGES.map((stage, i) => ({ stage, label: STAGE_LABELS[stage], done: stageIndex >= 0 && i < stageIndex, current: i === stageIndex })),
      amount: num(opportunity.amount),
      disbursedAmount: num(opportunity.disbursedAmount),
      entityName: opportunity.entity?.name ?? null,
      nextAction: opportunity.nextAction,
      sla: closed ? null : slaOf(opportunity.slaDueAt),
      withdrawReason: opportunity.withdrawReason,
      createdAt: opportunity.createdAt.toISOString(),
      stageAt: opportunity.stageAt.toISOString(),
      allowedMoves,
    },
    client: {
      firstName: person.firstName,
      lastName: person.lastName,
      name: personName(person),
      documentType: person.documentType,
      documentTypeLabel: DOCUMENT_TYPES_ID[person.documentType] ?? person.documentType,
      documentLast4: person.documentLast4,
      email: person.email,
      hasPhone: Boolean(person.phoneEnc),
      city: person.city,
      monthlyIncome: num(person.monthlyIncome),
      hasAccount: Boolean(person.userId),
      canInvite: Boolean(person.email && !person.userId && !emailAccount),
    },
    registeredBy: { organization: opportunity.allyOrg?.name ?? null, ally: opportunity.allyUser?.name ?? null },
    consents: {
      active: person.consents.map((c) => ({ code: c.purpose, title: CONSENT_PURPOSES.find((p) => p.code === c.purpose)?.title ?? c.purpose, grantedAt: c.grantedAt.toISOString() })),
      pending: CONSENT_PURPOSES.filter((p) => !consented.has(p.code)).map((p) => ({ code: p.code, title: p.title, text: p.text, required: p.required })),
      entidades: consented.has('ENTIDADES'),
    },
    blocking: closed ? [] : blocking,
    timeline: opportunity.stages.map((s) => ({
      id: s.id,
      from: s.from,
      to: s.to,
      fromLabel: s.from ? STAGE_LABELS[s.from] : null,
      toLabel: STAGE_LABELS[s.to],
      note: s.note,
      by: nameOf(s.byUserId),
      createdAt: s.createdAt.toISOString(),
    })),
    checklist: items.map(({ type, latest }) => ({
      type: documentTypeView(type),
      latest: latest
        ? {
            id: latest.id,
            version: latest.version,
            fileName: latest.fileName,
            status: statusOf(DOC_STATUS, latest.status),
            rejectReason: latest.rejectReason,
            expiresAt: day(latest.expiresAt),
            createdAt: latest.createdAt.toISOString(),
            viewable: latest.status !== 'QUARANTINED' && latest.scanResult === 'CLEAN',
          }
        : null,
      canUpload: !closed && latest?.status !== 'APPROVED',
    })),
    requiredMissing: items.filter((i) => i.type.required && i.latest?.status !== 'APPROVED').length,
    tasks: tasks.map((t) => taskView(t, user.id)),
    interactions: interactions.map((i) => ({
      id: i.id,
      channel: i.channel,
      channelLabel: CHANNEL_LABEL[i.channel] ?? i.channel,
      summary: i.summary,
      visibleToClient: i.visibleToClient,
      by: nameOf(i.byUserId),
      createdAt: i.createdAt.toISOString(),
    })),
    offers: opportunity.offers.map((o) => offerView(o, today)),
    commission: commission
      ? {
          id: commission.id,
          status: statusOf(COMMISSION_STATUS, commission.status),
          baseAmount: toNumber(commission.baseAmount),
          percent: Number(commission.percent),
          gross: toNumber(commission.gross),
          withholding: toNumber(commission.withholding),
          net: toNumber(commission.net),
          expectedPayAt: day(commission.expectedPayAt),
        }
      : null,
  };
}

// ── GET /aliado/embudo ─────────────────────────────────────────────────

const PER_COLUMN = 25;

export async function aliadoEmbudo(user: SessionUser): Promise<AliadoEmbudoResponse> {
  const admin = isAllyAdmin(user);
  const cases = await getPrisma().opportunity.findMany({
    where: allyCases(user),
    orderBy: { stageAt: 'asc' },
    take: 3000,
    select: {
      id: true,
      code: true,
      stage: true,
      stageAt: true,
      slaDueAt: true,
      product: true,
      amount: true,
      disbursedAmount: true,
      withdrawReason: true,
      person: { select: { firstName: true, lastName: true } },
      allyUser: { select: { name: true } },
      stages: { orderBy: { createdAt: 'asc' }, select: { to: true, createdAt: true } },
    },
  });

  const reached = new Map<Stage, number>(PIPELINE_STAGES.map((s) => [s, 0]));
  const stints = new Map<Stage, number[]>(PIPELINE_STAGES.map((s) => [s, []]));
  const withdrawReasons = new Map<string, number>();
  for (const c of cases) {
    const maxIndex = Math.max(...c.stages.map((s) => PIPELINE_STAGES.indexOf(s.to)), PIPELINE_STAGES.indexOf(c.stage === 'POSTSALE' ? 'DISBURSED' : c.stage));
    PIPELINE_STAGES.forEach((stage, i) => {
      if (i <= maxIndex) reached.set(stage, (reached.get(stage) ?? 0) + 1);
    });
    c.stages.forEach((change, i) => {
      const next = c.stages[i + 1];
      if (next && PIPELINE_STAGES.includes(change.to)) stints.get(change.to)!.push(next.createdAt.getTime() - change.createdAt.getTime());
    });
    if (c.stage === 'WITHDRAWN' && c.withdrawReason) withdrawReasons.set(c.withdrawReason, (withdrawReasons.get(c.withdrawReason) ?? 0) + 1);
  }
  const leads = reached.get('LEAD') ?? 0;
  const withdrawn = cases.filter((c) => c.stage === 'WITHDRAWN');

  return {
    ok: true,
    admin,
    total: cases.length,
    columns: PIPELINE_STAGES.map((stage) => {
      const column = cases.filter((c) => c.stage === stage || (stage === 'DISBURSED' && c.stage === 'POSTSALE'));
      const visible = stage === 'DISBURSED' ? [...column].reverse().slice(0, PER_COLUMN) : column.slice(0, PER_COLUMN);
      return {
        stage,
        label: STAGE_LABELS[stage],
        count: column.length,
        amount: column.reduce((s, c) => s + toNumber(stage === 'DISBURSED' ? c.disbursedAmount ?? c.amount : c.amount), 0),
        more: Math.max(0, column.length - PER_COLUMN),
        cases: visible.map((c) => ({
          id: c.id,
          code: c.code,
          clientName: personName(c.person),
          productLabel: PRODUCTS[c.product] ?? c.product,
          amount: num(c.amount),
          disbursedAmount: num(c.disbursedAmount),
          daysInStage: daysBetween(c.stageAt),
          sla: stage === 'DISBURSED' ? null : slaOf(c.slaDueAt),
          allyName: admin ? c.allyUser?.name ?? null : null,
        })),
      };
    }),
    withdrawn: withdrawn
      .slice(-50)
      .reverse()
      .map((c) => ({ id: c.id, code: c.code, clientName: personName(c.person), productLabel: PRODUCTS[c.product] ?? c.product, reason: c.withdrawReason })),
    conversion: PIPELINE_STAGES.map((stage, i) => {
      const n = reached.get(stage) ?? 0;
      const prev = i > 0 ? reached.get(PIPELINE_STAGES[i - 1]) ?? 0 : n;
      const times = stints.get(stage) ?? [];
      return {
        stage,
        label: STAGE_LABELS[stage],
        reached: n,
        ofPrevious: i === 0 ? (n ? 1 : null) : prev ? n / prev : null,
        avgHoursInStage: stage === 'DISBURSED' || !times.length ? null : Math.round((times.reduce((a, b) => a + b, 0) / times.length / 3_600_000) * 10) / 10,
      };
    }),
    withdrawal: {
      count: withdrawn.length,
      leads,
      rate: leads ? withdrawn.length / leads : null,
      reasons: [...withdrawReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
    },
  };
}

// ── GET /aliado/agenda ─────────────────────────────────────────────────

export async function aliadoAgenda(user: SessionUser): Promise<AliadoAgendaResponse> {
  const prisma = getPrisma();
  const today = bogotaYmd();
  const todayStart = bogotaDayStart(today);
  const weekEnd = bogotaDayStart(addDaysYmd(today, 8));
  const include = { opportunity: { select: { id: true, code: true } } };
  const [overdue, upcoming, later, done, cases] = await Promise.all([
    prisma.task.findMany({ where: { assigneeId: user.id, status: 'OPEN', dueAt: { lt: todayStart } }, orderBy: { dueAt: 'asc' }, take: 100, include }),
    prisma.task.findMany({ where: { assigneeId: user.id, status: 'OPEN', dueAt: { gte: todayStart, lt: weekEnd } }, orderBy: { dueAt: 'asc' }, take: 300, include }),
    prisma.task.count({ where: { assigneeId: user.id, status: 'OPEN', dueAt: { gte: weekEnd } } }),
    prisma.task.findMany({ where: { assigneeId: user.id, status: { in: ['DONE', 'CANCELLED'] } }, orderBy: [{ doneAt: 'desc' }, { dueAt: 'desc' }], take: 10, include }),
    prisma.opportunity.findMany({
      where: { AND: [allyCases(user), { stage: { in: ACTIVE_STAGES } }] },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, code: true, person: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const days = Array.from({ length: 8 }, (_, i) => addDaysYmd(today, i));
  return {
    ok: true,
    today,
    overdue: overdue.map((t) => taskView(t, user.id)),
    days: days.map((d) => ({
      date: d,
      title: d === today ? `Hoy · ${dayTitle(d)}` : d === addDaysYmd(today, 1) ? `Mañana · ${dayTitle(d)}` : dayTitle(d),
      tasks: upcoming.filter((t) => bogotaYmd(t.dueAt) === d).map((t) => taskView(t, user.id)),
    })),
    laterCount: later,
    done: done.map((t) => ({ ...taskView(t, user.id), editable: false })),
    caseOptions: cases.map((c) => ({ id: c.id, code: c.code, clientName: personName(c.person) })),
    kinds: TASK_KINDS,
  };
}

// ── GET /aliado/comisiones ─────────────────────────────────────────────

const EXAMPLE_BASE = 100_000_000;
const STATUS_ORDER: CommissionStatus[] = ['CAUSED', 'APPROVED', 'SCHEDULED', 'PAID', 'REVERSED'];

export async function aliadoComisiones(user: SessionUser): Promise<AliadoComisionesResponse> {
  const prisma = getPrisma();
  const [commissions, org, rules] = await Promise.all([
    scopedCommissions(user),
    user.organizationId ? prisma.organization.findUnique({ where: { id: user.organizationId }, select: { id: true, name: true, tier: true } }) : Promise.resolve(null),
    user.organizationId ? prisma.commissionRule.findMany({ where: { active: true, OR: [{ organizationId: null }, { organizationId: user.organizationId }] } }) : Promise.resolve([]),
  ]);
  const admin = isAllyAdmin(user);
  const now = new Date();
  return {
    ok: true,
    admin,
    organization: orgView(org),
    totals: STATUS_ORDER.map((status) => {
      const rows = commissions.filter((c) => c.status === status);
      return { status, label: COMMISSION_STATUS[status]?.label ?? status, count: rows.length, net: rows.reduce((s, c) => s + toNumber(c.net), 0) };
    }),
    commissions: commissions.map((c) => {
      const snap = readSnapshot(c.ruleSnapshot);
      return {
        id: c.id,
        status: statusOf(COMMISSION_STATUS, c.status),
        baseAmount: toNumber(c.baseAmount),
        percent: Number(c.percent),
        gross: toNumber(c.gross),
        withholding: toNumber(c.withholding),
        net: toNumber(c.net),
        case: {
          id: c.opportunity.id,
          code: c.opportunity.code,
          product: c.opportunity.product,
          productLabel: PRODUCTS[c.opportunity.product] ?? c.opportunity.product,
          clientName: personName(c.opportunity.person),
          entityName: c.opportunity.entity?.name ?? null,
          disbursedAmount: num(c.opportunity.disbursedAmount),
          disbursedAt: iso(c.opportunity.stages[0]?.createdAt),
        },
        allyName: admin ? c.allyUser?.name ?? null : null,
        rule: { ...snap, basisLabel: BASIS_LABELS[snap.basis ?? ''] ?? snap.basis ?? 'Monto desembolsado' },
        causedAt: c.causedAt.toISOString(),
        approvedAt: iso(c.approvedAt),
        expectedPayAt: day(c.expectedPayAt),
        paidAt: iso(c.paidAt),
        paymentRef: c.paymentRef,
        reversedAt: iso(c.reversedAt),
        reverseReason: c.reverseReason,
      };
    }),
    exampleBase: EXAMPLE_BASE,
    rules: org
      ? Object.entries(PRODUCTS).map(([code, label]) => {
          const rule = pickRule(rules, org, code, now);
          return {
            product: code,
            productLabel: label,
            rule: rule
              ? {
                  id: rule.id,
                  name: rule.name,
                  version: rule.version,
                  percent: Number(rule.percent),
                  withholdingPct: Number(rule.withholdingPct),
                  paymentDays: rule.paymentDays,
                  validFrom: day(rule.validFrom),
                  validTo: day(rule.validTo),
                  exampleNet: computeCommission(EXAMPLE_BASE, Number(rule.percent), Number(rule.withholdingPct)).net,
                }
              : null,
          };
        })
      : [],
    csvUrl: '/api/aliado/comisiones',
  };
}

// ── GET /aliado/academia y /aliado/academia/{slug} ─────────────────────

export async function aliadoAcademia(user: SessionUser): Promise<AliadoAcademiaResponse> {
  const prisma = getPrisma();
  const [courses, enrollments, certs, blocking] = await Promise.all([
    prisma.course.findMany({ where: { active: true }, orderBy: [{ critical: 'desc' }, { mandatory: 'desc' }, { sortOrder: 'asc' }] }),
    prisma.enrollment.findMany({ where: { userId: user.id } }),
    prisma.certification.findMany({ where: { userId: user.id }, orderBy: { issuedAt: 'desc' } }),
    allyBlockingCertifications(prisma, user.id),
  ]);
  const byCourse = latestCertByCourse(certs);
  return {
    ok: true,
    blocking,
    validCount: courses.filter((c) => certState(byCourse.get(c.id)?.expiresAt).valid).length,
    courses: courses.map((course) => {
      const lessons = readLessons(course.lessons).length;
      const enrollment = enrollments.find((e) => e.courseId === course.id);
      const cert = byCourse.get(course.id);
      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        summary: course.summary,
        mandatory: course.mandatory,
        critical: course.critical,
        passScore: course.passScore,
        lessons,
        progress: progressPct(enrollment?.lessonsDone ?? [], lessons),
        attempts: enrollment?.attempts ?? 0,
        bestScore: enrollment?.bestScore ?? null,
        certification: cert ? { code: cert.code, expiresAt: cert.expiresAt.toISOString() } : null,
        state: critical(certState(cert?.expiresAt), course.critical),
      };
    }),
  };
}

export async function aliadoCurso(session: CurrentSession, slug: string): Promise<AliadoCursoResponse> {
  const prisma = getPrisma();
  const course = await prisma.course.findFirst({ where: { slug, active: true } });
  if (!course) throw new ApiError('Ese curso no está disponible.', 404);
  const [enrollment, certs, attemptsToday] = await Promise.all([
    prisma.enrollment.findUnique({ where: { userId_courseId: { userId: session.user.id, courseId: course.id } } }),
    prisma.certification.findMany({ where: { userId: session.user.id, courseId: course.id } }),
    prisma.auditEvent.count({ where: { action: 'academy.quiz_attempt', actorId: session.user.id, entityId: course.id, at: { gte: bogotaDayStart(bogotaYmd()) } } }),
  ]);
  const lessons = readLessons(course.lessons);
  const done = new Set(enrollment?.lessonsDone ?? []);
  const cert = latestCertByCourse(certs).get(course.id);
  return {
    ok: true,
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      summary: course.summary,
      mandatory: course.mandatory,
      critical: course.critical,
      passScore: course.passScore,
      validityDays: course.validityDays,
      version: course.version,
    },
    lessons: lessons.map((l, index) => ({ index, title: l.title, body: l.body, done: done.has(index) })),
    progress: progressPct(enrollment?.lessonsDone ?? [], lessons.length),
    allSeen: lessons.every((_, i) => done.has(i)),
    // Solo preguntas y opciones: el índice correcto nunca sale del servidor.
    quiz: publicQuiz(course.quiz).map((q, index) => ({ index, q: q.q, options: q.options })),
    attemptsToday,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS_PER_DAY - attemptsToday),
    maxAttemptsPerDay: MAX_ATTEMPTS_PER_DAY,
    certification: cert ? { code: cert.code, expiresAt: cert.expiresAt.toISOString(), state: certState(cert.expiresAt) } : null,
  };
}

// ── Verificaciones previas de alcance (404 uniforme antes de ejecutar la acción) ──

export async function assertCaseInScope(user: SessionUser, id: string): Promise<void> {
  const found = await getPrisma().opportunity.findFirst({ where: { id, ...allyCases(user) }, select: { id: true } });
  if (!found) throw new ApiError('No encontramos ese caso en tu cartera.', 404);
}

export async function assertOwnTask(user: SessionUser, id: string): Promise<void> {
  const found = await getPrisma().task.findFirst({ where: { id, assigneeId: user.id }, select: { id: true } });
  if (!found) throw new ApiError('No encontramos esa actividad en tu agenda.', 404);
}
