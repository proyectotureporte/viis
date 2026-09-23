import type { Prisma } from '@/app/generated/prisma/client';
import type { CommissionStatus } from '@/app/generated/prisma/enums';
import { allyStats, MIN_CASES_FOR_RANKING, type AllyStats } from '@/app/(plataforma)/empresa/aliados/stats';
import { bogotaDayEnd, bogotaDayStart, qs, sp, spDate, spEnum, spUuid, todayBogota, type SearchParams } from '@/lib/empresa/params';
import { COMMISSION_STATUS, PRODUCTS, toNumber } from '@/lib/labels';
import { ApiError } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import { can, ROLE_LABELS } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import type {
  AliadoResponse,
  AliadosResponse,
  AllyStatsView,
  ComisionesResponse,
  ComisionesTab,
  CommissionRuleRow,
} from '@/lib/movil/contract-empresa';
import { day, fullName, iso, labelOf, options, pageInfo, pageParam, plainLabel, productLabel, stageLabel } from './common';

// ── Aliados ─────────────────────────────────────────────────────────────

const KINDS: Record<string, string> = { ALLY_COMPANY: 'Aliado empresa', ALLY_PERSON: 'Aliado persona natural' };
const TIERS = ['BASE', 'PLATA', 'ORO'];
export const SCORE_DEFINITION =
  'Puntaje responsable (0–100) = 40 % conversión (casos desembolsados ÷ casos creados) + 40 % calidad documental (documentos en primera versión aprobados ÷ primeras versiones revisadas) + 20 % × (1 − tasa de desistimiento). No incluye volumen para no premiar la presión comercial.';

function statsView(s: AllyStats | undefined): AllyStatsView {
  return {
    cases: s?.cases ?? 0,
    disbursed: s?.disbursed ?? 0,
    withdrawn: s?.withdrawn ?? 0,
    disbursedSum: s?.disbursedSum ?? 0,
    monthSum: s?.monthSum ?? 0,
    docsFirstApproved: s?.docsFirstApproved ?? 0,
    docsReviewed: s?.docsReviewed ?? 0,
    conversion: s?.conversion ?? null,
    withdrawalRate: s?.withdrawalRate ?? null,
    docQuality: s?.docQuality ?? null,
    score: s?.score ?? null,
  };
}

/** Ranking responsable de aliados (misma lectura que `/empresa/aliados`). */
export async function aliados(): Promise<AliadosResponse> {
  const prisma = getPrisma();
  const [orgs, stats] = await Promise.all([
    prisma.organization.findMany({
      where: { kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } }, users: { where: { active: true }, select: { id: true } } },
    }),
    allyStats(),
  ]);
  const ranked = orgs
    .map((o) => ({ org: o, s: stats.get(o.id) }))
    .sort((a, b) => {
      const aOk = (a.s?.cases ?? 0) >= MIN_CASES_FOR_RANKING ? 1 : 0;
      const bOk = (b.s?.cases ?? 0) >= MIN_CASES_FOR_RANKING ? 1 : 0;
      return bOk - aOk || (b.s?.score ?? -1) - (a.s?.score ?? -1) || a.org.name.localeCompare(b.org.name);
    });
  return {
    ok: true,
    rows: ranked.map(({ org, s }, i) => {
      const small = (s?.cases ?? 0) < MIN_CASES_FOR_RANKING;
      const goal = org.monthlyGoal === null ? null : toNumber(org.monthlyGoal);
      return {
        id: org.id,
        rank: small ? null : i + 1,
        name: org.name,
        kind: plainLabel(KINDS, org.kind, 'info'),
        territory: org.territory,
        tier: org.tier,
        active: org.active,
        users: { active: org.users.length, total: org._count.users },
        monthlyGoal: goal,
        goalRatio: goal ? (s?.monthSum ?? 0) / goal : null,
        stats: statsView(s),
        smallSample: small,
      };
    }),
    minCasesForRanking: MIN_CASES_FOR_RANKING,
    scoreDefinition: SCORE_DEFINITION,
    kinds: options(KINDS),
    tiers: TIERS,
  };
}

/** Ficha del aliado con desempeño, usuarios y certificaciones (misma lectura que `/empresa/aliados/[id]`). */
export async function aliado(id: string): Promise<AliadoResponse> {
  const prisma = getPrisma();
  const org = await prisma.organization.findFirst({
    where: { id, kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } },
    include: {
      users: {
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: {
          id: true, name: true, email: true, role: true, active: true, passwordHash: true, totpEnabledAt: true, lastLoginAt: true,
          certifications: { select: { courseId: true, expiresAt: true } },
          tokens: { where: { purpose: 'INVITE', usedAt: null }, select: { expiresAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  });
  if (!org) throw new ApiError('El aliado no existe.', 404);
  const [stats, courses, recentCases] = await Promise.all([
    allyStats(org.id),
    prisma.course.findMany({ where: { active: true, OR: [{ critical: true }, { mandatory: true }] }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, critical: true, mandatory: true } }),
    prisma.opportunity.findMany({
      where: { allyOrgId: org.id },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, code: true, product: true, stage: true, updatedAt: true, person: { select: { firstName: true, lastName: true } }, allyUser: { select: { name: true } } },
    }),
  ]);
  const s = stats.get(org.id);
  const now = new Date();
  const goal = org.monthlyGoal === null ? null : toNumber(org.monthlyGoal);
  return {
    ok: true,
    org: { id: org.id, name: org.name, kind: plainLabel(KINDS, org.kind, 'info'), taxId: org.taxId, territory: org.territory, tier: org.tier, active: org.active, monthlyGoal: goal, createdAt: org.createdAt.toISOString() },
    stats: statsView(s),
    goalRatio: goal ? (s?.monthSum ?? 0) / goal : null,
    courses,
    users: org.users.map((u) => {
      const certs = courses.map((c) => {
        const list = u.certifications.filter((x) => x.courseId === c.id);
        const valid = list.find((x) => x.expiresAt > now);
        if (valid) return { courseId: c.id, ok: true, state: { code: 'VALID', label: `Vigente hasta ${day(valid.expiresAt)}`, tone: 'ok' as const } };
        if (list.length) {
          const last = list.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
          return { courseId: c.id, ok: false, state: { code: 'EXPIRED', label: `Vencida el ${day(last.expiresAt)}`, tone: 'bad' as const } };
        }
        return { courseId: c.id, ok: false, state: { code: 'PENDING', label: 'Pendiente', tone: 'wait' as const } };
      });
      const invited = !u.passwordHash;
      const blocked = certs.some((x, i) => courses[i].critical && !x.ok);
      const state = !u.active
        ? { code: 'INACTIVE', label: 'Inactivo', tone: 'gray' as const }
        : invited
          ? { code: 'INVITED', label: 'Invitado', tone: 'info' as const }
          : !u.totpEnabledAt
            ? { code: 'NO_MFA', label: 'Sin 2FA', tone: 'wait' as const }
            : { code: 'ACTIVE', label: 'Activo', tone: 'ok' as const };
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: { code: u.role, label: ROLE_LABELS[u.role], tone: 'info' },
        active: u.active,
        state,
        invitation: invited && u.tokens[0] ? { expiresAt: u.tokens[0].expiresAt.toISOString(), expired: u.tokens[0].expiresAt <= now } : null,
        lastLoginAt: iso(u.lastLoginAt),
        blocked: u.active && blocked,
        certifications: certs,
        can: { resendInvite: invited && u.active, deactivate: u.active, reactivate: !u.active },
      };
    }),
    recentCases: recentCases.map((c) => ({
      id: c.id,
      code: c.code,
      clientName: fullName(c.person),
      product: productLabel(c.product),
      stage: stageLabel(c.stage),
      allyUserName: c.allyUser?.name ?? null,
      updatedAt: c.updatedAt.toISOString(),
    })),
    options: {
      kinds: options(KINDS),
      roles: [
        { value: 'ALLY', label: ROLE_LABELS.ALLY },
        { value: 'ALLY_ADMIN', label: ROLE_LABELS.ALLY_ADMIN },
      ],
      tiers: TIERS,
    },
  };
}

// ── Comisiones ──────────────────────────────────────────────────────────

const COMM_PAGE = 25;
const STATUSES = ['CAUSED', 'APPROVED', 'SCHEDULED', 'PAID', 'REVERSED'] as const satisfies readonly CommissionStatus[];
const TABS: ComisionesTab[] = ['liquidacion', 'resumen', 'reglas'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Liquidación, resumen por aliado y reglas versionadas (misma lectura que `/empresa/comisiones`). */
export async function comisiones(session: CurrentSession, params: SearchParams): Promise<ComisionesResponse> {
  const tabParam = sp(params, 'tab');
  const tab: ComisionesTab = TABS.includes(tabParam as ComisionesTab) ? (tabParam as ComisionesTab) : 'liquidacion';
  const canPay = can(session.user.role, 'commission.pay');
  const canRules = can(session.user.role, 'commission.rules');
  const prisma = getPrisma();
  const orgs = await prisma.organization.findMany({ where: { kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } }, select: { id: true, name: true, tier: true, active: true }, orderBy: { name: 'asc' } });
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? 'Aliado';
  const base: ComisionesResponse = {
    ok: true,
    tab,
    orgs,
    statuses: STATUSES.map((s) => ({ value: s, label: COMMISSION_STATUS[s].label })),
    can: { pay: canPay, rules: canRules },
  };
  const today = todayBogota();

  if (tab === 'liquidacion') {
    const estado = spEnum(params, 'estado', STATUSES);
    const aliadoId = spUuid(params, 'aliado');
    const desde = spDate(params, 'desde');
    const hasta = spDate(params, 'hasta');
    const page = pageParam(params);
    const where: Prisma.CommissionWhereInput = {
      ...(estado ? { status: estado } : {}),
      ...(aliadoId ? { allyOrgId: aliadoId } : {}),
      ...(desde || hasta ? { causedAt: { ...(desde ? { gte: bogotaDayStart(desde) } : {}), ...(hasta ? { lt: bogotaDayEnd(hasta) } : {}) } } : {}),
    };
    const [total, rows, totals] = await Promise.all([
      prisma.commission.count({ where }),
      prisma.commission.findMany({
        where,
        orderBy: [{ causedAt: 'asc' }],
        skip: (page - 1) * COMM_PAGE,
        take: COMM_PAGE,
        include: {
          opportunity: { select: { id: true, code: true, product: true, person: { select: { firstName: true, lastName: true } }, entity: { select: { name: true } } } },
          allyUser: { select: { name: true } },
          rule: { select: { name: true, version: true } },
        },
      }),
      prisma.commission.aggregate({ where, _sum: { gross: true, withholding: true, net: true } }),
    ]);
    base.liquidacion = {
      filters: { estado, aliado: aliadoId, desde, hasta },
      page: pageInfo(page, COMM_PAGE, total),
      totals: { count: total, gross: toNumber(totals._sum.gross), withholding: toNumber(totals._sum.withholding), net: toNumber(totals._sum.net) },
      rows: rows.map((c) => {
        const approvedOrScheduled = c.status === 'APPROVED' || c.status === 'SCHEDULED';
        return {
          id: c.id,
          case: { id: c.opportunity.id, code: c.opportunity.code, clientName: fullName(c.opportunity.person), product: productLabel(c.opportunity.product), entityName: c.opportunity.entity?.name ?? null },
          allyOrg: { id: c.allyOrgId, name: orgName(c.allyOrgId) },
          allyUserName: c.allyUser?.name ?? null,
          baseAmount: toNumber(c.baseAmount),
          percent: Number(c.percent.toString()),
          gross: toNumber(c.gross),
          withholding: toNumber(c.withholding),
          net: toNumber(c.net),
          rule: c.rule,
          status: labelOf(COMMISSION_STATUS, c.status),
          causedAt: c.causedAt.toISOString(),
          approvedAt: iso(c.approvedAt),
          expectedPayAt: day(c.expectedPayAt),
          paidAt: iso(c.paidAt),
          paymentRef: c.paymentRef,
          reversedAt: iso(c.reversedAt),
          reverseReason: c.reverseReason,
          can: { approve: c.status === 'CAUSED', schedule: approvedOrScheduled, pay: canPay && approvedOrScheduled, reverse: c.status !== 'REVERSED' },
        };
      }),
    };
  } else if (tab === 'resumen') {
    const desde = spDate(params, 'desde') || `${today.slice(0, 7)}-01`;
    const hasta = spDate(params, 'hasta') || today;
    const estado = spEnum(params, 'estado', STATUSES);
    const groups = await prisma.commission.groupBy({
      by: ['allyOrgId', 'status'],
      where: { causedAt: { gte: bogotaDayStart(desde), lt: bogotaDayEnd(hasta) } },
      _sum: { net: true, gross: true },
      _count: { _all: true },
    });
    const orgIds = [...new Set(groups.map((g) => g.allyOrgId))];
    const cell = (org: string, s: CommissionStatus) => groups.find((g) => g.allyOrgId === org && g.status === s);
    base.resumen = {
      filters: { desde, hasta, estado },
      rows: orgIds
        .map((org) => {
          const byStatus = Object.fromEntries(
            STATUSES.map((s) => {
              const g = cell(org, s);
              return [s, g ? { net: toNumber(g._sum.net), gross: toNumber(g._sum.gross), count: g._count._all } : null];
            }),
          ) as Record<CommissionStatus, { net: number; gross: number; count: number } | null>;
          return { orgId: org, orgName: orgName(org), totalNet: STATUSES.reduce((a, s) => a + (byStatus[s]?.net ?? 0), 0), byStatus };
        })
        .sort((a, b) => b.totalNet - a.totalNet),
      csvPath: `/api/empresa/comisiones/csv${qs({ desde, hasta, estado })}`,
    };
  } else {
    const [rules, usage] = await Promise.all([
      prisma.commissionRule.findMany({ orderBy: [{ name: 'asc' }, { version: 'desc' }], include: { organization: { select: { id: true, name: true } } } }),
      prisma.commission.groupBy({ by: ['ruleId'], _count: { _all: true } }),
    ]);
    const latestByName = new Map<string, string>();
    for (const r of rules) if (!latestByName.has(r.name)) latestByName.set(r.name, r.id);
    base.reglas = {
      rows: rules.map((r): CommissionRuleRow => ({
        id: r.id,
        name: r.name,
        version: r.version,
        isLatest: latestByName.get(r.name) === r.id,
        scope: r.organization ? r.organization.name : r.tier ? `Nivel ${r.tier}` : 'General',
        organization: r.organization,
        tier: r.tier,
        product: r.product ? productLabel(r.product) : null,
        basis: r.basis,
        percent: Number(r.percent.toString()),
        withholdingPct: Number(r.withholdingPct.toString()),
        paymentDays: r.paymentDays,
        validFrom: ymd(r.validFrom),
        validTo: day(r.validTo),
        active: r.active,
        inForce: r.active && ymd(r.validFrom) <= today && (!r.validTo || ymd(r.validTo) >= today),
        uses: usage.find((u) => u.ruleId === r.id)?._count._all ?? 0,
        can: { version: canRules && latestByName.get(r.name) === r.id, close: canRules && (!r.validTo || ymd(r.validTo) > today) },
      })),
      products: options(PRODUCTS),
      priorityNote:
        'Las reglas nunca se modifican: cambiar un porcentaje crea una nueva versión con su vigencia y cierra la anterior. Prioridad: organización > nivel > general; producto exacto > cualquiera; mayor versión.',
    };
  }
  return base;
}
