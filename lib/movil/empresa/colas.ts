import type { Prisma } from '@/app/generated/prisma/client';
import { sp, spEnum, spUuid, type SearchParams } from '@/lib/empresa/params';
import { DOC_STATUS, PAYMENT_STATUS, REQUEST_KINDS, REQUEST_STATUS, toNumber } from '@/lib/labels';
import { ApiError } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import type { CurrentSession } from '@/lib/security/session';
import type {
  DocumentosResponse,
  PagosResponse,
  PagosTab,
  PaymentRow,
  PaymentStatus,
  RequestStatus,
  SolicitudesResponse,
  SolicitudResponse,
} from '@/lib/movil/contract-empresa';
import { day, fullName, iso, labelOf, pageInfo, pageParam, plainLabel, roleLabel, slaView, staffOptions } from './common';

// ── Documentos ──────────────────────────────────────────────────────────

const DOC_PAGE = 20;

/** Cola de revisión documental (misma consulta que `/empresa/documentos`): los más antiguos primero. */
export async function documentos(session: CurrentSession, params: SearchParams): Promise<DocumentosResponse> {
  const status = spEnum(params, 'estado', ['UPLOADED', 'IN_REVIEW'] as const);
  const typeId = spUuid(params, 'tipo');
  const mine = sp(params, 'mios') === '1';
  const page = pageParam(params);
  const prisma = getPrisma();
  const where: Prisma.DocumentWhereInput = {
    status: status ? status : { in: ['UPLOADED', 'IN_REVIEW'] },
    payment: { is: null },
    ...(typeId ? { typeId } : {}),
    ...(mine ? { reviewedById: session.user.id, status: 'IN_REVIEW' } : {}),
  };
  const [total, docs, types, quarantined, quarantinedCount, byStatus] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * DOC_PAGE,
      take: DOC_PAGE,
      include: {
        type: { select: { name: true, validityDays: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, code: true } },
      },
    }),
    prisma.documentType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.document.findMany({
      where: { status: 'QUARANTINED' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: { type: { select: { name: true } }, person: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.document.count({ where: { status: 'QUARANTINED' } }),
    prisma.document.groupBy({ by: ['status'], where: { status: { in: ['UPLOADED', 'IN_REVIEW'] }, payment: { is: null } }, _count: { _all: true } }),
  ]);
  const reviewerIds = [...new Set(docs.map((d) => d.reviewedById).filter((v): v is string => Boolean(v)))];
  const reviewers = reviewerIds.length ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } }) : [];
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const now = Date.now();
  return {
    ok: true,
    filters: { estado: status, tipo: typeId, mios: mine ? '1' : '' },
    counts: { uploaded: count('UPLOADED'), inReview: count('IN_REVIEW'), quarantined: quarantinedCount },
    page: pageInfo(page, DOC_PAGE, total),
    rows: docs.map((d) => {
      const reviewer = reviewers.find((r) => r.id === d.reviewedById) ?? null;
      const reviewerIsMe = d.reviewedById === session.user.id;
      return {
        id: d.id,
        type: { name: d.type.name, validityDays: d.type.validityDays },
        version: d.version,
        createdAt: d.createdAt.toISOString(),
        waitingHours: Math.floor((now - d.createdAt.getTime()) / 3_600_000),
        person: { id: d.person.id, name: fullName(d.person) },
        case: d.opportunity ?? null,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        scanResult: d.scanResult,
        status: labelOf(DOC_STATUS, d.status),
        reviewer: reviewer ? { id: reviewer.id, name: reviewer.name } : null,
        reviewerIsMe,
        canTake: d.status === 'UPLOADED' || !reviewerIsMe,
      };
    }),
    quarantined: quarantined.map((d) => ({ id: d.id, type: d.type.name, person: { id: d.person.id, name: fullName(d.person) }, createdAt: d.createdAt.toISOString(), scanResult: d.scanResult })),
    types: types.map((t) => ({ value: t.id, label: t.name })),
  };
}

// ── Pagos ───────────────────────────────────────────────────────────────

const PAY_PAGE = 20;
const TABS: PagosTab[] = ['cola', 'conciliar', 'historico'];

function kindLabel(kind: string, applyMode: string | null) {
  const label = kind === 'INSTALLMENT' ? 'Cuota' : kind === 'PREPAYMENT' ? (applyMode === 'PAYMENT' ? 'Abono · reducir cuota' : 'Abono · reducir plazo') : kind;
  return { code: kind === 'PREPAYMENT' ? `PREPAYMENT_${applyMode === 'PAYMENT' ? 'PAYMENT' : 'TERM'}` : kind, label, tone: 'info' as const };
}

/** Pagos reportados por pestaña (misma consulta que `/empresa/pagos`), con detección de duplicados. */
export async function pagos(params: SearchParams): Promise<PagosResponse> {
  const tabParam = sp(params, 'tab');
  const tab: PagosTab = TABS.includes(tabParam as PagosTab) ? (tabParam as PagosTab) : 'cola';
  const page = pageParam(params);
  const prisma = getPrisma();
  const where: Prisma.PaymentReportWhereInput =
    tab === 'cola' ? { status: { in: ['REPORTED', 'IN_REVIEW'] } } : tab === 'conciliar' ? { status: 'VALIDATED' } : { status: { in: ['REJECTED', 'RECONCILED', 'VALIDATED'] } };
  const orderBy: Prisma.PaymentReportOrderByWithRelationInput = tab === 'historico' ? { createdAt: 'desc' } : { createdAt: 'asc' };
  const [total, payments, counts] = await Promise.all([
    prisma.paymentReport.count({ where }),
    prisma.paymentReport.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAY_PAGE,
      take: PAY_PAGE,
      include: {
        loan: { select: { id: true, alias: true, balance: true, entity: { select: { name: true } }, person: { select: { id: true, firstName: true, lastName: true, documentLast4: true } } } },
        document: { select: { id: true, status: true, fileName: true, scanResult: true } },
      },
    }),
    prisma.paymentReport.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const ids = payments.map((p) => p.id);
  const dupCandidates = payments.length
    ? await prisma.paymentReport.findMany({
        where: {
          id: { notIn: ids },
          OR: [{ dedupeKey: { in: payments.map((p) => p.dedupeKey) } }, ...payments.map((p) => ({ loanId: p.loanId, paidOn: p.paidOn, amount: p.amount }))],
        },
        select: { id: true, dedupeKey: true, loanId: true, paidOn: true, amount: true, status: true },
      })
    : [];
  const reconciled = payments.filter((p) => p.status === 'RECONCILED').map((p) => p.id);
  const reconcileEvents = reconciled.length
    ? await prisma.auditEvent.findMany({ where: { action: 'payment.reconciled', entity: 'PaymentReport', entityId: { in: reconciled } }, select: { entityId: true, after: true, at: true } })
    : [];
  const reviewerIds = [...new Set(payments.map((p) => p.reviewedById).filter((v): v is string => Boolean(v)))];
  const reviewers = reviewerIds.length ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } }) : [];

  const rows: PaymentRow[] = payments.map((p) => {
    const dups = [...dupCandidates, ...payments].filter(
      (o) => o.id !== p.id && (o.dedupeKey === p.dedupeKey || (o.loanId === p.loanId && o.paidOn.getTime() === p.paidOn.getTime() && o.amount === p.amount)),
    );
    const event = reconcileEvents.find((e) => e.entityId === p.id);
    const reference = event && event.after && typeof event.after === 'object' && 'reference' in event.after ? String((event.after as { reference?: unknown }).reference ?? '') : null;
    const pending = p.status === 'REPORTED' || p.status === 'IN_REVIEW';
    return {
      id: p.id,
      kind: kindLabel(p.kind, p.applyMode),
      amount: toNumber(p.amount),
      status: labelOf(PAYMENT_STATUS, p.status),
      paidOn: day(p.paidOn),
      createdAt: p.createdAt.toISOString(),
      channel: p.channel,
      reference: p.reference,
      client: { personId: p.loan.person.id, name: fullName(p.loan.person), documentLast4: p.loan.person.documentLast4 },
      loan: { id: p.loan.id, alias: p.loan.alias, entityName: p.loan.entity?.name ?? null, balance: toNumber(p.loan.balance) },
      support: p.document
        ? { documentId: p.document.id, fileName: p.document.fileName, status: labelOf(DOC_STATUS, p.document.status), viewable: p.document.status !== 'QUARANTINED' && p.document.scanResult === 'CLEAN' }
        : null,
      reviewer: p.reviewedById ? { name: reviewers.find((r) => r.id === p.reviewedById)?.name ?? 'Usuario interno', at: iso(p.reviewedAt) } : null,
      rejectReason: p.status === 'REJECTED' ? p.rejectReason : null,
      reconciled: p.status === 'RECONCILED' ? { at: iso(event?.at), reference } : null,
      possibleDuplicates: dups.map((d) => ({ id: d.id, status: labelOf(PAYMENT_STATUS, d.status) })),
      can: { take: p.status === 'REPORTED', validate: pending, reject: pending, reconcile: p.status === 'VALIDATED' },
    };
  });
  const byStatus = Object.fromEntries((['REPORTED', 'IN_REVIEW', 'VALIDATED', 'REJECTED', 'RECONCILED'] as PaymentStatus[]).map((s) => [s, countOf(s)])) as Record<PaymentStatus, number>;
  return {
    ok: true,
    tab,
    counts: { cola: byStatus.REPORTED + byStatus.IN_REVIEW, conciliar: byStatus.VALIDATED, byStatus },
    page: pageInfo(page, PAY_PAGE, total),
    rows,
    notice: 'Cargar un soporte no sustituye pagar al acreedor ni garantiza la imputación: compara siempre contra el extracto o la evidencia disponible. Todo rechazo debe explicar el motivo al cliente.',
  };
}

// ── Solicitudes ─────────────────────────────────────────────────────────

const REQ_PAGE = 25;
const REQ_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT', 'RESOLVED', 'REJECTED'] as const;
const OPEN_STATUSES: RequestStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'];
const KIND_LABELS = Object.fromEntries(Object.entries(REQUEST_KINDS).map(([k, v]) => [k, v.label]));
/** En la consola "WAITING_CLIENT" se lee desde el punto de vista del equipo. */
const statusLabel = (s: string) => (s === 'WAITING_CLIENT' ? { code: s, label: 'Esperando al cliente', tone: 'wait' as const } : labelOf(REQUEST_STATUS, s));

export async function solicitudes(session: CurrentSession, params: SearchParams): Promise<SolicitudesResponse> {
  const status = spEnum(params, 'estado', REQ_STATUSES);
  const kind = spEnum(params, 'tipo', Object.keys(REQUEST_KINDS));
  const who = sp(params, 'resp');
  const overdue = sp(params, 'vencidas') === '1';
  const page = pageParam(params);
  const now = new Date();
  const where: Prisma.ServiceRequestWhereInput = {
    status: status || { in: OPEN_STATUSES },
    ...(kind ? { kind } : {}),
    ...(who === 'yo' ? { assigneeId: session.user.id } : who === 'ninguno' ? { assigneeId: null } : /^[0-9a-f-]{36}$/i.test(who) ? { assigneeId: who } : {}),
    ...(overdue ? { slaDueAt: { lt: now } } : {}),
  };
  const prisma = getPrisma();
  const [total, requests, staff, overdueCount, openCount] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      orderBy: [{ slaDueAt: 'asc' }],
      skip: (page - 1) * REQ_PAGE,
      take: REQ_PAGE,
      include: { person: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { messages: true } } },
    }),
    staffOptions(),
    prisma.serviceRequest.count({ where: { status: { in: OPEN_STATUSES }, slaDueAt: { lt: now } } }),
    prisma.serviceRequest.count({ where: { status: { in: OPEN_STATUSES } } }),
  ]);
  const nowMs = now.getTime();
  return {
    ok: true,
    filters: { estado: status, tipo: kind, resp: who, vencidas: overdue ? '1' : '' },
    counts: { open: openCount, overdue: overdueCount },
    page: pageInfo(page, REQ_PAGE, total),
    rows: requests.map((r) => {
      const closed = r.status === 'RESOLVED' || r.status === 'REJECTED';
      const assignee = r.assigneeId ? staff.find((u) => u.id === r.assigneeId) : null;
      return {
        id: r.id,
        code: r.code,
        subject: r.subject,
        kind: plainLabel(KIND_LABELS, r.kind, 'info'),
        status: statusLabel(r.status),
        client: { id: r.person.id, name: fullName(r.person) },
        messages: r._count.messages,
        assignee: r.assigneeId ? { id: r.assigneeId, name: assignee?.name ?? 'Usuario inactivo' } : null,
        sla: closed ? { dueAt: r.slaDueAt.toISOString(), overdue: false, text: 'Cerrada', tone: 'gray' } : slaView(r.slaDueAt, nowMs)!,
        closed,
        closedAt: closed ? r.updatedAt.toISOString() : null,
      };
    }),
    options: {
      statuses: REQ_STATUSES.map((s) => ({ value: s, label: statusLabel(s).label })),
      kinds: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })),
      staff,
    },
  };
}

export async function solicitud(session: CurrentSession, id: string): Promise<SolicitudResponse> {
  const prisma = getPrisma();
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, firstName: true, lastName: true, email: true, userId: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!request) throw new ApiError('La solicitud no existe.', 404);
  const authorIds = [...new Set([...request.messages.map((m) => m.byUserId), request.createdById].filter((v): v is string => Boolean(v)))];
  const [authors, staff, scenario] = await Promise.all([
    authorIds.length ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, role: true } }) : [],
    staffOptions(),
    request.scenarioId
      ? prisma.scenario.findUnique({ where: { id: request.scenarioId }, select: { id: true, name: true, kind: true, results: true, assumptions: true, engineVersion: true, inputsHash: true, createdAt: true, userId: true } })
      : null,
  ]);
  // Solo se muestra el escenario si es del propio cliente (igual que la web).
  const shared = scenario && scenario.userId === request.person.userId ? scenario : null;
  const closed = request.status === 'RESOLVED' || request.status === 'REJECTED';
  const assignee = request.assigneeId ? staff.find((u) => u.id === request.assigneeId) : null;
  return {
    ok: true,
    request: {
      id: request.id,
      code: request.code,
      subject: request.subject,
      detail: request.detail,
      kind: plainLabel(KIND_LABELS, request.kind, 'info'),
      status: statusLabel(request.status),
      closed,
      resolution: request.resolution,
      createdAt: request.createdAt.toISOString(),
      sla: slaView(request.slaDueAt)!,
      assignee: request.assigneeId ? { id: request.assigneeId, name: assignee?.name ?? 'Usuario inactivo' } : null,
      assignedToMe: request.assigneeId === session.user.id,
    },
    client: { id: request.person.id, name: fullName(request.person), email: request.person.email, hasAccount: Boolean(request.person.userId) },
    messages: request.messages.map((m) => {
      const a = authors.find((x) => x.id === m.byUserId);
      const fromClient = m.byUserId === request.person.userId;
      return {
        id: m.id,
        body: m.body,
        internal: m.internal,
        fromClient,
        author: fromClient ? { name: `${request.person.firstName} (cliente)`, roleLabel: null } : { name: a?.name ?? 'Usuario', roleLabel: a ? roleLabel(a.role) : null },
        createdAt: m.createdAt.toISOString(),
      };
    }),
    scenario: shared
      ? {
          id: shared.id,
          name: shared.name,
          kind: shared.kind,
          createdAt: shared.createdAt.toISOString(),
          engineVersion: shared.engineVersion,
          inputsHashPrefix: shared.inputsHash.slice(0, 16),
          results: shared.results,
          assumptions: shared.assumptions,
        }
      : null,
    options: {
      staff,
      statuses: OPEN_STATUSES.map((s) => ({ value: s, label: statusLabel(s).label })),
      outcomes: [
        { value: 'RESOLVED', label: 'Resuelta' },
        { value: 'REJECTED', label: 'No procedente' },
      ],
    },
  };
}
