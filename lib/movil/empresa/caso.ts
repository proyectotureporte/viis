import { ADVISOR_DECLARATION } from '@/app/(plataforma)/empresa/casos/nuevo/create';
import { CAPTURE_CHANNELS, DOC_TYPES } from '@/app/(plataforma)/empresa/casos/nuevo/schema';
import { CONSENT_PURPOSES, CONSENT_VERSION } from '@/lib/consent';
import { allowedTransitions } from '@/lib/domain/cases';
import { checklist } from '@/lib/domain/documents';
import type { OfferResults } from '@/lib/empresa/finance';
import { todayBogota } from '@/lib/empresa/params';
import { COMMISSION_STATUS, DOCUMENT_TYPES_ID, PIPELINE_STAGES, PRIORITY_LABELS, PRODUCTS, STAGE_LABELS, toNumber } from '@/lib/labels';
import { ApiError } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import { can, caseScope } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import type {
  CasoResponse,
  ChecklistItemView,
  ConsentHistoryRow,
  ConsentView,
  DocumentVersionView,
  NuevoCasoResponse,
  OfferResultsView,
  OfferView,
  StaffRole,
} from '@/lib/movil/contract-empresa';
import { auditEventView } from './auditoria';
import {
  channelLabel,
  confidenceLabel,
  day,
  docVersionView,
  documentTypeLabel,
  entityOptions,
  fullName,
  iso,
  labelOf,
  loanView,
  num,
  options,
  plainLabel,
  priorityLabel,
  productLabel,
  propertyView,
  slaView,
  staffOptions,
  stageLabel,
  SYSTEM_LABELS,
} from './common';
import { TASK_KINDS } from './operacion';

export const INTERACTION_CHANNELS: Record<string, string> = { LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp', CORREO: 'Correo', REUNION: 'Reunión', INTERNO: 'Nota interna' };
const ACCEPT_CHANNELS: Record<string, string> = { PRESENCIAL: 'Presencial', LLAMADA: 'Llamada', VIDEOLLAMADA: 'Videollamada', CORREO: 'Correo', WHATSAPP: 'WhatsApp' };

type ConsentRow = { id: string; purpose: string; textVersion: string; textHash: string; channel: string; grantedAt: Date; capturedBy: string | null; revokedAt: Date | null; revokedBy: string | null };

export function consentViews(consents: ConsentRow[], nameOf: (id: string | null) => string | null): { current: ConsentView[]; history: ConsentHistoryRow[] } {
  const active = consents.filter((c) => !c.revokedAt);
  const current = CONSENT_PURPOSES.map((p) => {
    const c = active.find((x) => x.purpose === p.code);
    return {
      purpose: p.code,
      title: p.title,
      required: p.required,
      active: Boolean(c),
      textVersion: c?.textVersion ?? null,
      grantedAt: iso(c?.grantedAt),
      channel: c?.channel ?? null,
      capturedBy: c ? (c.capturedBy ? nameOf(c.capturedBy) ?? 'Usuario' : 'El cliente') : null,
    };
  });
  const history = consents.map((c) => ({
    id: c.id,
    purpose: c.purpose,
    title: CONSENT_PURPOSES.find((p) => p.code === c.purpose)?.title ?? c.purpose,
    textVersion: c.textVersion,
    textHashPrefix: c.textHash.slice(0, 12),
    channel: c.channel,
    grantedAt: c.grantedAt.toISOString(),
    capturedBy: c.capturedBy ? nameOf(c.capturedBy) ?? 'Usuario' : 'El cliente',
    revokedAt: iso(c.revokedAt),
    revokedBy: c.revokedBy ? nameOf(c.revokedBy) ?? 'Usuario' : null,
  }));
  return { current, history };
}

function offerResultsView(r: OfferResults): OfferResultsView {
  return {
    payment: r.payment,
    months: r.months,
    payoffDate: r.payoffDate,
    totalInterest: r.totalInterest,
    totalInsurance: r.totalInsurance,
    totalPaid: r.totalPaid,
    upfrontCosts: r.upfrontCosts,
    totalCost: r.totalCost,
    costPerMillion: r.costPerMillion,
    startDate: r.startDate,
    uvr: r.uvr ?? null,
    portfolio: r.portfolio ?? null,
    assumptions: r.assumptions ?? [],
    warnings: r.warnings ?? [],
    engineVersion: r.engineVersion,
  };
}

/** Expediente 360 del caso: misma lectura que `/empresa/casos/[id]`, dentro del alcance del rol. */
export async function caso(session: CurrentSession, id: string): Promise<CasoResponse> {
  const role = session.user.role;
  const prisma = getPrisma();
  const opp = await prisma.opportunity.findFirst({
    where: { id, ...caseScope(session.user) },
    include: {
      person: {
        include: {
          user: { select: { id: true, email: true, active: true } },
          consents: { orderBy: { grantedAt: 'desc' } },
          properties: { include: { valuations: { orderBy: { asOf: 'desc' }, take: 1 } }, orderBy: { createdAt: 'asc' } },
          loans: { include: { entity: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
        },
      },
      entity: true,
      assignee: { select: { id: true, name: true } },
      allyOrg: { select: { id: true, name: true, tier: true } },
      allyUser: { select: { id: true, name: true, email: true } },
      stages: { orderBy: { createdAt: 'desc' } },
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] },
      interactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      offers: { orderBy: { createdAt: 'asc' } },
      commissions: { include: { rule: { select: { name: true, version: true } } } },
    },
  });
  if (!opp) throw new ApiError('El caso no existe o no está dentro de tu alcance.', 404);
  const person = opp.person;

  const [items, allDocs, entities, staff, docTypes] = await Promise.all([
    checklist(prisma as unknown as Parameters<typeof checklist>[0], person.id, opp.product),
    prisma.document.findMany({ where: { personId: person.id }, orderBy: [{ typeId: 'asc' }, { version: 'desc' }] }),
    entityOptions(),
    staffOptions(),
    prisma.documentType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  const relatedIds = [person.id, ...allDocs.map((d) => d.id), ...opp.offers.map((o) => o.id), ...opp.commissions.map((c) => c.id)];
  const events = await prisma.auditEvent.findMany({
    where: { OR: [{ entity: 'Opportunity', entityId: opp.id }, { entityId: { in: relatedIds } }] },
    orderBy: { id: 'desc' },
    take: 50,
  });
  const userIds = new Set<string>();
  for (const e of events) if (e.actorId) userIds.add(e.actorId);
  for (const s of opp.stages) if (s.byUserId) userIds.add(s.byUserId);
  for (const i of opp.interactions) if (i.byUserId) userIds.add(i.byUserId);
  for (const o of opp.offers) if (o.acceptedById) userIds.add(o.acceptedById);
  for (const d of allDocs) if (d.reviewedById) userIds.add(d.reviewedById);
  for (const c of person.consents) for (const u of [c.capturedBy, c.revokedBy]) if (u) userIds.add(u);
  const users = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, email: true, role: true } })).map((u) => [u.id, u]),
  );
  const who = (uid: string | null | undefined) => (uid ? users.get(uid)?.name ?? 'Usuario' : 'Sistema');

  const perm = {
    stage: can(role, 'case.stage'),
    assign: can(role, 'case.assign'),
    note: can(role, 'case.note'),
    review: can(role, 'doc.review'),
    upload: can(role, 'doc.upload'),
    offer: can(role, 'offer.manage'),
    person: can(role, 'person.read'),
  };
  const nowMs = Date.now();
  const today = todayBogota();
  const closedForOffers = ['WITHDRAWN', 'POSTSALE'].includes(opp.stage);
  const stageIndex = PIPELINE_STAGES.indexOf(opp.stage);
  const transitions = allowedTransitions(opp.stage);
  const accepted = opp.offers.find((o) => o.acceptedAt);

  const offerRows = opp.offers.map((o) => ({ offer: o, r: o.results as unknown as OfferResults }));
  const minTotal = Math.min(...offerRows.map((x) => x.r.totalCost ?? Infinity));
  const minPayment = Math.min(...offerRows.map((x) => x.r.payment ?? Infinity));
  const offers: OfferView[] = offerRows.map(({ offer: o, r }) => {
    const evidence = (o.acceptEvidence ?? null) as { channel?: string; declaration?: string } | null;
    return {
      id: o.id,
      entityName: o.entityName,
      rateEa: Number(o.rateEa.toString()),
      system: plainLabel(SYSTEM_LABELS, o.system),
      termMonths: o.termMonths,
      amount: toNumber(o.amount),
      monthlyInsurance: toNumber(o.monthlyInsurance),
      upfrontCosts: toNumber(o.upfrontCosts),
      conditions: o.conditions,
      validUntil: day(o.validUntil),
      expired: Boolean(o.validUntil && o.validUntil.toISOString().slice(0, 10) < today),
      source: o.source,
      engineVersion: o.engineVersion,
      createdAt: o.createdAt.toISOString(),
      results: offerResultsView(r),
      bestPayment: offerRows.length > 1 && r.payment === minPayment,
      bestTotalCost: offerRows.length > 1 && r.totalCost === minTotal,
      accepted: o.acceptedAt ? { at: o.acceptedAt.toISOString(), by: who(o.acceptedById), channel: evidence?.channel ?? null, declaration: evidence?.declaration ?? null } : null,
    };
  });

  const docsByType = new Map<string, typeof allDocs>();
  for (const d of allDocs) docsByType.set(d.typeId, [...(docsByType.get(d.typeId) ?? []), d]);
  const checklistItems: ChecklistItemView[] = items.map(({ type, latest }) => {
    const latestView: DocumentVersionView | null = latest ? docVersionView(latest, users, today) : null;
    return {
      type: { id: type.id, code: type.code, name: type.name, required: type.required, validityDays: type.validityDays, description: type.description },
      status: latestView?.status ?? null,
      latest: latestView,
      history: (docsByType.get(type.id) ?? []).filter((d) => d.id !== latest?.id).map((d) => docVersionView(d, users, today)),
      pendingReview: Boolean(latest && (latest.status === 'UPLOADED' || latest.status === 'IN_REVIEW')),
    };
  });

  const consents = consentViews(person.consents, (uid) => (uid ? users.get(uid)?.name ?? null : null));
  const income = num(person.monthlyIncome);
  const expenses = num(person.monthlyExpenses);

  return {
    ok: true,
    case: {
      id: opp.id,
      code: opp.code,
      product: productLabel(opp.product),
      channel: channelLabel(opp.channel),
      stage: stageLabel(opp.stage),
      stageAt: opp.stageAt.toISOString(),
      priority: priorityLabel(opp.priority),
      sla: slaView(opp.slaDueAt, nowMs),
      escalatedAt: iso(opp.escalatedAt),
      closed: ['WITHDRAWN', 'POSTSALE', 'DISBURSED'].includes(opp.stage),
      assignee: opp.assignee,
      entity: opp.entity ? { id: opp.entity.id, name: opp.entity.name } : null,
      amount: num(opp.amount),
      disbursedAmount: num(opp.disbursedAmount),
      ally: { user: opp.allyUser, org: opp.allyOrg },
      nextAction: opp.nextAction,
      withdrawReason: opp.stage === 'WITHDRAWN' ? opp.withdrawReason : null,
      createdAt: opp.createdAt.toISOString(),
    },
    client: {
      personId: person.id,
      name: fullName(person),
      firstName: person.firstName,
      lastName: person.lastName,
      documentType: documentTypeLabel(person.documentType),
      documentLast4: person.documentLast4,
      email: person.email,
      hasPhone: Boolean(person.phoneEnc),
      city: person.city,
      account: person.user ? (person.user.active ? 'ACTIVE' : 'INACTIVE') : 'NONE',
      allyProtectionUntil: person.ownerAllyOrgId ? iso(person.ownerUntil) : null,
    },
    household: {
      monthlyIncome: income,
      monthlyExpenses: expenses,
      savings: num(person.savings),
      monthlyMargin: income !== null && expenses !== null ? income - expenses : null,
      goals: person.goals,
      confidence: confidenceLabel('DECLARED'),
    },
    properties: person.properties.map(propertyView),
    loans: person.loans.map(loanView),
    consents: consents.current,
    revokedConsents: consents.history.filter((c) => c.revokedAt),
    timeline: {
      pipeline: [
        ...PIPELINE_STAGES.map((s, i) => ({ stage: s, label: STAGE_LABELS[s], state: (s === opp.stage ? 'now' : stageIndex >= 0 && i < stageIndex ? 'done' : 'todo') as 'done' | 'now' | 'todo' })),
        ...(opp.stage === 'WITHDRAWN' || opp.stage === 'POSTSALE' ? [{ stage: opp.stage, label: STAGE_LABELS[opp.stage], state: 'now' as const }] : []),
      ],
      changes: opp.stages.map((s) => ({ id: s.id, from: s.from ? stageLabel(s.from) : null, to: stageLabel(s.to), note: s.note, by: who(s.byUserId), at: s.createdAt.toISOString() })),
      allowedTransitions: perm.stage ? transitions.map((t) => ({ value: t, label: STAGE_LABELS[t] })) : [],
      filingRules: 'Para radicar se exige autorización de compartir con entidades, entidad asignada, documentos requeridos aprobados y, si hay aliado, sus certificaciones críticas vigentes. Desembolsado exige `disbursedAmount`; Desistido exige `withdrawReason`.',
    },
    checklist: { approved: checklistItems.filter((i) => i.latest?.status.code === 'APPROVED').length, total: checklistItems.length, items: checklistItems },
    interactions: opp.interactions.map((i) => ({
      id: i.id,
      channel: plainLabel(INTERACTION_CHANNELS, i.channel, i.channel === 'INTERNO' ? 'gray' : 'info'),
      summary: i.summary,
      visibleToClient: i.visibleToClient,
      by: who(i.byUserId),
      createdAt: i.createdAt.toISOString(),
    })),
    tasks: opp.tasks.map((t) => ({
      id: t.id,
      kind: plainLabel(TASK_KINDS, t.kind, 'info'),
      title: t.title,
      detail: t.detail,
      assignee: { id: t.assignee.id, name: t.assignee.name },
      dueAt: t.dueAt.toISOString(),
      status: t.status,
      overdue: t.status === 'OPEN' && t.dueAt.getTime() < nowMs,
      doneAt: iso(t.doneAt),
    })),
    offers,
    acceptedOfferId: accepted?.id ?? null,
    commissions: opp.commissions.map((c) => ({
      id: c.id,
      rule: { name: c.rule.name, version: c.rule.version },
      baseAmount: toNumber(c.baseAmount),
      percent: Number(c.percent.toString()),
      gross: toNumber(c.gross),
      withholding: toNumber(c.withholding),
      net: toNumber(c.net),
      status: labelOf(COMMISSION_STATUS, c.status),
      causedAt: c.causedAt.toISOString(),
      expectedPayAt: day(c.expectedPayAt),
      paymentRef: c.paymentRef,
      reverseReason: c.reverseReason,
    })),
    commissionNote: opp.commissions.length ? null : opp.allyOrgId ? 'La comisión se causa al registrar el desembolso.' : 'Caso directo: no genera comisión de aliado.',
    auditLog: events.map((e) => auditEventView(e, users)),
    options: {
      staff,
      entities,
      documentTypes: docTypes.map((t) => ({ value: t.id, label: t.name })),
      interactionChannels: options(INTERACTION_CHANNELS),
      taskKinds: options(TASK_KINDS),
      priorities: Object.entries(PRIORITY_LABELS).map(([value, v]) => ({ value, label: v.label })),
      offerSystems: options(SYSTEM_LABELS),
      acceptChannels: options(ACCEPT_CHANNELS),
    },
    can: {
      stage: perm.stage,
      assign: perm.assign,
      note: perm.note,
      review: perm.review,
      upload: perm.upload,
      offer: perm.offer,
      revealDocument: perm.person,
      escalate: perm.stage && !closedForOffers,
      acceptOffer: perm.offer && !accepted && offerRows.length > 0,
      createOffer: perm.offer && !closedForOffers,
    },
  };
}

/** Catálogos del formulario de alta de caso (y de conversión de leads). */
export async function nuevoCasoForm(session: CurrentSession): Promise<NuevoCasoResponse> {
  const allowed = can(session.user.role, 'person.create');
  const [entities, staff] = allowed
    ? await Promise.all([entityOptions(), staffOptions(['ADVISOR', 'COORDINATOR', 'FIN_ANALYST', 'POSTSALE', 'ADMIN'])])
    : [[], []];
  return {
    ok: true,
    allowed,
    lockAssigneeToSelf: session.user.role === 'ADVISOR',
    consentVersion: CONSENT_VERSION,
    declaration: ADVISOR_DECLARATION,
    options: {
      documentTypes: DOC_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPES_ID[t] ?? t })),
      products: options(PRODUCTS),
      entities,
      staff: staff.map((s) => ({ ...s, role: s.role as StaffRole })),
      captureChannels: options(CAPTURE_CHANNELS),
      consentPurposes: CONSENT_PURPOSES.map((p) => ({ code: p.code, title: p.title, text: p.text, required: p.required })),
    },
  };
}
