import type { Prisma } from '@/app/generated/prisma/client';
import type { Role, Stage } from '@/app/generated/prisma/enums';
import { conversion, funnel, northMetric, paymentTimes, stageTimes, type ConversionRow } from '@/app/(plataforma)/empresa/analitica/queries';
import { DOC_PRODUCTS } from '@/app/(plataforma)/empresa/catalogos/constants';
import { addDaysYmd, bogotaDayEnd, bogotaDayStart, dateRange, sp, spEnum, todayBogota, type SearchParams } from '@/lib/empresa/params';
import { PAYMENT_STATUS, PIPELINE_STAGES, PRODUCTS, REQUEST_KINDS, STAGE_LABELS, STAGE_SLA_HOURS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import type { AnaliticaResponse, CatalogosResponse, ConversionRowView, StaffRole, UsuariosResponse } from '@/lib/movil/contract-empresa';
import { day, iso, labelOf, options, pageInfo, pageParam, plainLabel, productLabel, SYSTEM_LABELS } from './common';

// ── Analítica ───────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = { DIRECTO: 'Directo (asesor)', ALIADO: 'Aliados', WEB: 'Web' };
const NORTH_WINDOW_DAYS = 90;
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export const NORTH_DEFINITION = {
  household: 'Se aproxima por la persona titular del expediente (el esquema aún no agrupa miembros de un hogar).',
  active: 'Tiene usuario activo en la plataforma, un crédito activo o un caso no desistido.',
  actions: `En los últimos ${NORTH_WINDOW_DAYS} días: abono a capital validado por operación; oferta aceptada con evidencia; compra de cartera desembolsada; solicitud por dificultad de pago resuelta (prevención temprana); documento del inmueble aprobado (tradición y libertad, avalúo o póliza); o escenario guardado que el cliente convirtió en una solicitud (decisión informada).`,
  rule: 'Solo cuentan hechos validados por el equipo o registrados con evidencia, nunca simples visitas o simulaciones sueltas. Un hogar con varias acciones cuenta una sola vez en el total.',
};

/** Todos los indicadores de `/empresa/analitica` para el rango `?desde=&hasta=` (por defecto 90 días). */
export async function analitica(params: SearchParams): Promise<AnaliticaResponse> {
  const range = dateRange(params, 90);
  const { start, end } = range;
  const prisma = getPrisma();
  const now = new Date();
  const northEnd = bogotaDayEnd(range.to);
  const northStart = bogotaDayStart(addDaysYmd(range.to, -(NORTH_WINDOW_DAYS - 1)));

  const [funnelRows, conv, times, overdueByStage, docsReviewed, docsApprovedFirst, rejectsByType, withdrawn, paymentsByStatus, payTimes, requestsResolved, requestsOverdue, north] = await Promise.all([
    funnel(start, end),
    conversion(start, end),
    stageTimes(start, end),
    prisma.opportunity.groupBy({ by: ['stage'], where: { slaDueAt: { lt: now }, stage: { notIn: ['WITHDRAWN', 'DISBURSED', 'POSTSALE'] } }, _count: { _all: true } }),
    prisma.document.groupBy({ by: ['status'], where: { reviewedAt: { gte: start, lt: end }, status: { in: ['APPROVED', 'REJECTED'] } }, _count: { _all: true } }),
    prisma.document.count({ where: { reviewedAt: { gte: start, lt: end }, status: 'APPROVED', version: 1 } }),
    prisma.document.groupBy({ by: ['typeId'], where: { reviewedAt: { gte: start, lt: end }, status: 'REJECTED' }, _count: { _all: true }, orderBy: { _count: { typeId: 'desc' } }, take: 6 }),
    prisma.opportunity.groupBy({ by: ['withdrawReason'], where: { stage: 'WITHDRAWN', stageAt: { gte: start, lt: end } }, _count: { _all: true }, orderBy: { _count: { withdrawReason: 'desc' } }, take: 10 }),
    prisma.paymentReport.groupBy({ by: ['status'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
    paymentTimes(start, end),
    prisma.serviceRequest.findMany({ where: { status: 'RESOLVED', updatedAt: { gte: start, lt: end } }, select: { kind: true, updatedAt: true, slaDueAt: true } }),
    prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] }, slaDueAt: { lt: now } } }),
    northMetric(northStart, northEnd),
  ]);

  const allyIds = conv.filter((r) => r.dim === 'ally' && r.key).map((r) => r.key!);
  const entityIds = conv.filter((r) => r.dim === 'entity' && r.key).map((r) => r.key!);
  const [orgs, entities, types] = await Promise.all([
    prisma.organization.findMany({ where: { id: { in: allyIds } }, select: { id: true, name: true } }),
    prisma.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } }),
    prisma.documentType.findMany({ where: { id: { in: rejectsByType.map((r) => r.typeId) } }, select: { id: true, name: true } }),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const entityName = new Map(entities.map((e) => [e.id, e.name]));
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  const reached = PIPELINE_STAGES.map((stage, i) => ({ stage, label: STAGE_LABELS[stage], reached: funnelRows.filter((r) => r.idx >= i + 1).reduce((a, r) => a + r.n, 0) }));
  const created = reached[0]?.reached ?? 0;
  const filed = reached[4]?.reached ?? 0;
  const disbursed = reached[7]?.reached ?? 0;
  const channelRows = conv.filter((r) => r.dim === 'channel');
  const slaClosed = times.reduce((a, t) => a + t.withSla, 0);
  const slaOk = times.reduce((a, t) => a + t.withinSla, 0);
  const reviewedTotal = docsReviewed.reduce((a, r) => a + r._count._all, 0);
  const rejected = docsReviewed.find((r) => r.status === 'REJECTED')?._count._all ?? 0;
  const approved = docsReviewed.find((r) => r.status === 'APPROVED')?._count._all ?? 0;
  const payCount = (s: string) => paymentsByStatus.find((r) => r.status === s)?._count._all ?? 0;
  const payTotal = paymentsByStatus.reduce((a, r) => a + r._count._all, 0);
  const reqInSla = requestsResolved.filter((r) => r.updatedAt <= r.slaDueAt).length;
  const kindCounts = requestsResolved.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});
  const kindLabels = Object.fromEntries(Object.entries(REQUEST_KINDS).map(([k, v]) => [k, v.label]));

  const convView = (rows: ConversionRow[], name: (k: string | null) => string): ConversionRowView[] =>
    [...rows]
      .sort((a, b) => b.disbursed - a.disbursed || b.total - a.total)
      .map((r) => ({ key: r.key, label: name(r.key), total: r.total, filed: r.filed, disbursed: r.disbursed, createdToDisbursed: ratio(r.disbursed, r.total), filedToDisbursed: ratio(r.disbursed, r.filed), disbursedAmount: r.disbursedAmount }));

  return {
    ok: true,
    range: { desde: range.from, hasta: range.to, timezone: 'America/Bogota' },
    north: {
      windowDays: NORTH_WINDOW_DAYS,
      windowEnd: range.to,
      ratio: ratio(north.numerator, north.denominator),
      numerator: north.numerator,
      denominator: north.denominator,
      byKind: north.byKind.map((k) => ({ kind: k.kind, label: k.label, households: k.n })),
      definition: NORTH_DEFINITION,
    },
    kpis: {
      created,
      withdrawn: funnelRows.reduce((a, r) => a + r.withdrawn, 0),
      disbursed,
      disbursedAmount: channelRows.reduce((a, r) => a + r.disbursedAmount, 0),
      filed,
      filedToDisbursed: ratio(disbursed, filed),
      createdToDisbursed: ratio(disbursed, created),
      slaClosed,
      slaWithin: slaOk,
      slaRatio: ratio(slaOk, slaClosed),
      overdueOpenToday: overdueByStage.reduce((a, r) => a + r._count._all, 0),
    },
    funnel: reached,
    withdrawalReasons: withdrawn.map((w) => ({ reason: w.withdrawReason, count: w._count._all })),
    stageTimes: PIPELINE_STAGES.map((s) => times.find((t) => t.stage === s))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({
        stage: t.stage as Stage,
        label: STAGE_LABELS[t.stage as Stage] ?? t.stage,
        closed: t.n,
        avgHours: t.avgH,
        medianHours: t.medH,
        slaHours: STAGE_SLA_HOURS[t.stage as Stage] ?? null,
        withinSlaRatio: ratio(t.withinSla, t.withSla),
        overdueOpen: overdueByStage.find((o) => o.stage === t.stage)?._count._all ?? 0,
      })),
    conversion: {
      byChannel: convView(channelRows, (k) => CHANNEL_LABELS[k ?? ''] ?? k ?? 'Sin canal'),
      byAlly: convView(conv.filter((r) => r.dim === 'ally'), (k) => (k ? orgName.get(k) ?? 'Aliado' : 'Sin aliado (directo o web)')),
      byEntity: convView(conv.filter((r) => r.dim === 'entity'), (k) => (k ? entityName.get(k) ?? 'Entidad' : 'Sin entidad asignada')),
    },
    documents: {
      reviewed: reviewedTotal,
      rejected,
      approved,
      rejectRatio: ratio(rejected, reviewedTotal),
      approvedFirstRatio: ratio(docsApprovedFirst, approved),
      topRejectedTypes: rejectsByType.map((r) => ({ name: typeName.get(r.typeId) ?? 'Tipo', count: r._count._all })),
    },
    payments: {
      total: payTotal,
      byStatus: ['REPORTED', 'IN_REVIEW', 'VALIDATED', 'RECONCILED', 'REJECTED'].map((s) => ({ status: labelOf(PAYMENT_STATUS, s), count: payCount(s) })),
      reconciledRatio: ratio(payCount('RECONCILED'), payTotal),
      avgReviewHours: payTimes.avgH ?? null,
    },
    requests: {
      resolved: requestsResolved.length,
      withinSla: reqInSla,
      withinSlaRatio: ratio(reqInSla, requestsResolved.length),
      overdueOpenToday: requestsOverdue,
      resolvedByKind: Object.entries(kindCounts).map(([k, v]) => ({ kind: plainLabel(kindLabels, k, 'info'), count: v })),
      note: 'Aproximación: se toma la última actualización de la solicitud resuelta como fecha de resolución.',
    },
  };
}

// ── Catálogos ───────────────────────────────────────────────────────────

export async function catalogos(): Promise<CatalogosResponse> {
  const prisma = getPrisma();
  const today = todayBogota();
  const todayDate = new Date(`${today}T00:00:00Z`);
  const [entities, rates, params, types, courses] = await Promise.all([
    prisma.entity.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { _count: { select: { opportunities: true, loans: true } } } }),
    prisma.referenceRate.findMany({ orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }], take: 100, include: { entity: { select: { id: true, name: true } } } }),
    prisma.financialParameter.findMany({ orderBy: [{ key: 'asc' }, { asOf: 'desc' }, { createdAt: 'desc' }], take: 300 }),
    prisma.documentType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { documents: true } } } }),
    prisma.course.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], include: { _count: { select: { certifications: true, enrollments: true } } } }),
  ]);
  const byKey = new Map<string, typeof params>();
  for (const p of params) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  return {
    ok: true,
    entities: entities.map((e) => ({ id: e.id, name: e.name, active: e.active, agreement: e.agreement, slaHours: e.slaHours, notes: e.notes, cases: e._count.opportunities, loans: e._count.loans, updatedAt: e.updatedAt.toISOString() })),
    rates: rates.map((r) => ({
      id: r.id,
      entity: r.entity,
      product: productLabel(r.product),
      system: plainLabel(SYSTEM_LABELS, r.system),
      rateEa: Number(r.rateEa.toString()),
      asOf: day(r.asOf),
      validUntil: day(r.validUntil),
      expired: Boolean(r.validUntil && r.validUntil < todayDate),
      source: r.source,
    })),
    parameters: [...byKey.entries()].map(([key, rows]) => ({
      key,
      latest: Number(rows[0].value.toString()),
      unit: key === 'INFLACION_PROYECTADA' ? 'fraction' : 'number',
      history: rows.slice(0, 20).map((r) => ({ id: r.id, value: Number(r.value.toString()), asOf: day(r.asOf), source: r.source, createdAt: r.createdAt.toISOString() })),
    })),
    documentTypes: types.map((t) => ({ id: t.id, code: t.code, name: t.name, description: t.description, validityDays: t.validityDays, products: t.products, required: t.required, active: t.active, sortOrder: t.sortOrder, documents: t._count.documents })),
    courses: courses.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      active: c.active,
      critical: c.critical,
      mandatory: c.mandatory,
      validityDays: c.validityDays,
      passScore: c.passScore,
      version: c.version,
      enrollments: c._count.enrollments,
      certifications: c._count.certifications,
      content: { lessons: c.lessons, quiz: c.quiz },
    })),
    options: { products: options(PRODUCTS), docProducts: options(DOC_PRODUCTS), systems: options({ FIXED_PESOS: 'Pesos (cuota fija)', UVR: 'UVR (tasa real sobre UVR)' }), parameterKeys: ['UVR', 'INFLACION_PROYECTADA'] },
    today,
  };
}

// ── Usuarios ────────────────────────────────────────────────────────────

const USER_PAGE = 25;
const STATES = ['activos', 'inactivos', 'pendientes', 'sin-mfa'] as const;

function device(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  if (/OpenV|okhttp|Expo|CFNetwork|Dart/i.test(ua) && !/Mozilla/.test(ua)) return `App OpenV${/Android|okhttp/i.test(ua) ? ' en Android' : /iOS|iPhone|CFNetwork/i.test(ua) ? ' en iOS' : ''}`;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Otro';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${browser} en ${os}`;
}

export async function usuarios(session: CurrentSession, params: SearchParams): Promise<UsuariosResponse> {
  const rol = spEnum(params, 'rol', STAFF_ROLES);
  const estado = spEnum(params, 'estado', STATES);
  const q = sp(params, 'q');
  const page = pageParam(params);
  const where: Prisma.UserWhereInput = { role: rol ? rol : { in: STAFF_ROLES } };
  if (estado === 'activos') where.active = true;
  if (estado === 'inactivos') where.active = false;
  if (estado === 'pendientes') where.passwordHash = null;
  if (estado === 'sin-mfa') where.totpEnabledAt = null;
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }];
  const prisma = getPrisma();
  const now = new Date();
  const [total, users, admins] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * USER_PAGE,
      take: USER_PAGE,
      include: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } }, orderBy: { lastSeenAt: 'desc' } } },
    }),
    prisma.user.count({ where: { role: 'ADMIN', active: true } }),
  ]);
  return {
    ok: true,
    filters: { q, rol: rol as StaffRole | '', estado },
    activeAdmins: admins,
    page: pageInfo(page, USER_PAGE, total),
    rows: users.map((u) => {
      const self = u.id === session.user.id;
      const pending = !u.passwordHash;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: { code: u.role, label: ROLE_LABELS[u.role], tone: 'info' },
        active: u.active,
        pendingInvitation: pending,
        mfaEnabled: Boolean(u.totpEnabledAt),
        mfaSince: iso(u.totpEnabledAt),
        self,
        lastLoginAt: iso(u.lastLoginAt),
        createdAt: u.createdAt.toISOString(),
        sessions: u.sessions.map((s) => ({ id: s.id, device: device(s.userAgent), current: s.id === session.id, mfaPassed: s.mfaPassed, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), expiresAt: s.expiresAt.toISOString() })),
        can: {
          changeRole: !(self && u.role === 'ADMIN'),
          deactivate: u.active && !self,
          reactivate: !u.active,
          resendInvite: pending && u.active,
          resetMfa: Boolean(u.totpEnabledAt) && !self,
        },
      };
    }),
    roles: STAFF_ROLES.map((r: Role) => ({ value: r, label: ROLE_LABELS[r] })),
  };
}
