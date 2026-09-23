import type { Prisma } from '@/app/generated/prisma/client';
import { normalizeDocument } from '@/lib/consent';
import { sp, spEnum, todayBogota, type SearchParams } from '@/lib/empresa/params';
import { DOC_STATUS, DOCUMENT_TYPES_ID, REQUEST_KINDS, REQUEST_STATUS } from '@/lib/labels';
import { ApiError } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';
import { blindIndex } from '@/lib/security/crypto';
import { can, caseScope } from '@/lib/security/rbac';
import type { CurrentSession } from '@/lib/security/session';
import type { ClienteFichaResponse, ClientesResponse, LeadRow, LeadsResponse, LeadStatus } from '@/lib/movil/contract-empresa';
import { consentViews, nuevoCasoForm } from './caso';
import {
  channelLabel,
  confidenceLabel,
  documentTypeLabel,
  fullName,
  iso,
  labelOf,
  loanView,
  num,
  pageInfo,
  pageParam,
  plainLabel,
  priorityLabel,
  productLabel,
  propertyView,
  slaView,
  stageLabel,
  day,
} from './common';

// ── Leads ───────────────────────────────────────────────────────────────

const LEAD_PAGE = 15;
const LEAD_STATUS: Record<LeadStatus, { label: string; tone: string }> = {
  NEW: { label: 'Nuevo', tone: 'info' },
  CONVERTED: { label: 'Convertido', tone: 'ok' },
  DISCARDED: { label: 'Descartado', tone: 'gray' },
};

/** "Juan Carlos Pérez Gómez" → nombres / apellidos (misma heurística que la web). */
function splitName(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' };
  const cut = words.length === 2 || words.length === 3 ? 1 : 2;
  return { firstName: words.slice(0, cut).join(' '), lastName: words.slice(cut).join(' ') };
}

export async function leads(session: CurrentSession, params: SearchParams): Promise<LeadsResponse> {
  const status: LeadStatus = spEnum(params, 'estado', ['NEW', 'CONVERTED', 'DISCARDED'] as const) || 'NEW';
  const page = pageParam(params);
  const prisma = getPrisma();
  const [total, rows, counts, form] = await Promise.all([
    prisma.contactRequest.count({ where: { status } }),
    prisma.contactRequest.findMany({
      where: { status },
      orderBy: { createdAt: status === 'NEW' ? 'asc' : 'desc' },
      skip: (page - 1) * LEAD_PAGE,
      take: LEAD_PAGE,
      include: { opportunity: { select: { id: true, code: true } } },
    }),
    prisma.contactRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    nuevoCasoForm(session),
  ]);
  const reasons = status === 'DISCARDED' && rows.length
    ? await prisma.auditEvent.findMany({ where: { action: 'lead.discarded', entity: 'ContactRequest', entityId: { in: rows.map((l) => l.id) } }, select: { entityId: true, after: true } })
    : [];
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return {
    ok: true,
    estado: status,
    counts: { NEW: countOf('NEW'), CONVERTED: countOf('CONVERTED'), DISCARDED: countOf('DISCARDED') },
    page: pageInfo(page, LEAD_PAGE, total),
    rows: rows.map((l): LeadRow => {
      const reason = reasons.find((r) => r.entityId === l.id)?.after as { reason?: string } | null | undefined;
      return {
        id: l.id,
        name: l.name,
        suggested: { ...splitName(l.name), email: l.email, phone: l.phone, city: l.city, captureChannel: 'TELEFONICO' },
        email: l.email,
        phone: l.phone,
        city: l.city,
        message: l.message,
        source: l.source,
        status: labelOf(LEAD_STATUS, l.status),
        createdAt: l.createdAt.toISOString(),
        case: l.opportunity ?? null,
        discardReason: reason?.reason ?? null,
      };
    }),
    form: { ...form.options, lockAssigneeToSelf: form.lockAssigneeToSelf, declaration: form.declaration },
  };
}

// ── Clientes ────────────────────────────────────────────────────────────

const CLIENT_PAGE = 20;
const DOC_TYPES = ['CC', 'CE', 'PA', 'PPT', 'NIT'] as const;
export const REVOKE_CHANNELS: Record<string, string> = {
  ESCRITO: 'Comunicación escrita',
  CORREO: 'Correo electrónico',
  TELEFONICO: 'Llamada telefónica',
  PRESENCIAL: 'Presencial',
  SOLICITUD_PLATAFORMA: 'Solicitud en la plataforma',
};

/** Búsqueda del expediente único (nombre/correo/últimos 4, o documento exacto por índice ciego). */
export async function clientes(session: CurrentSession, params: SearchParams): Promise<ClientesResponse> {
  const q = sp(params, 'q');
  const docType = spEnum(params, 'tipo', DOC_TYPES);
  const docNumber = sp(params, 'doc').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const page = pageParam(params);
  let where: Prisma.PersonWhereInput = {};
  let mode: 'doc' | 'text' | 'all' = 'all';
  if (docType && docNumber.length >= 4) {
    mode = 'doc';
    where = { documentIndex: blindIndex('doc', normalizeDocument(docType, docNumber)) };
  } else if (q) {
    mode = 'text';
    const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const or: Prisma.PersonWhereInput[] = [{ email: { contains: q, mode: 'insensitive' } }];
    if (/^\d{4}$/.test(q)) or.push({ documentLast4: q });
    or.push({ AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }] })) });
    where = { OR: or };
  }
  const scope = caseScope(session.user);
  const prisma = getPrisma();
  const [total, people] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * CLIENT_PAGE,
      take: CLIENT_PAGE,
      select: {
        id: true, firstName: true, lastName: true, email: true, city: true, documentType: true, documentLast4: true, createdAt: true, userId: true,
        opportunities: { where: scope, select: { code: true, stage: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { opportunities: { where: scope }, loans: true, requests: true } },
      },
    }),
  ]);
  return {
    ok: true,
    mode,
    // El documento completo buscado NO se devuelve: solo si hubo búsqueda exacta.
    filters: { q, tipo: docType, doc: mode === 'doc' ? `···${docNumber.slice(-4)}` : '' },
    page: pageInfo(page, CLIENT_PAGE, total),
    rows: people.map((p) => ({
      id: p.id,
      name: fullName(p),
      documentType: p.documentType,
      documentLast4: p.documentLast4,
      email: p.email,
      city: p.city,
      createdAt: p.createdAt.toISOString(),
      hasAccount: Boolean(p.userId),
      lastCase: p.opportunities[0] ? { code: p.opportunities[0].code, stage: stageLabel(p.opportunities[0].stage) } : null,
      counts: { cases: p._count.opportunities, loans: p._count.loans, requests: p._count.requests },
    })),
    documentTypes: DOC_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPES_ID[t] ?? t })),
    can: { createCase: can(session.user.role, 'case.create') },
  };
}

/** Ficha del cliente (misma lectura que `/empresa/clientes/[id]`; casos filtrados por alcance). */
export async function clienteFicha(session: CurrentSession, id: string): Promise<ClienteFichaResponse> {
  const prisma = getPrisma();
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, active: true, lastLoginAt: true } },
      consents: { orderBy: { grantedAt: 'desc' } },
      properties: { include: { valuations: { orderBy: { asOf: 'desc' }, take: 1 } }, orderBy: { createdAt: 'asc' } },
      loans: { include: { entity: { select: { name: true } } }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] },
      documents: { include: { type: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }], take: 60 },
      requests: { orderBy: { createdAt: 'desc' }, take: 30 },
      opportunities: {
        where: caseScope(session.user),
        orderBy: { createdAt: 'desc' },
        include: { entity: { select: { name: true } }, assignee: { select: { name: true } }, allyOrg: { select: { name: true } } },
      },
    },
  });
  if (!person) throw new ApiError('La persona no existe.', 404);
  const userIds = [...new Set(person.consents.flatMap((c) => [c.capturedBy, c.revokedBy]).filter((v): v is string => Boolean(v)))];
  const people = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const consents = consentViews(person.consents, (uid) => people.find((u) => u.id === uid)?.name ?? null);
  const now = Date.now();
  const today = todayBogota();
  return {
    ok: true,
    person: {
      id: person.id,
      name: fullName(person),
      firstName: person.firstName,
      lastName: person.lastName,
      documentType: documentTypeLabel(person.documentType),
      documentLast4: person.documentLast4,
      email: person.email,
      hasPhone: Boolean(person.phoneEnc),
      city: person.city,
      createdAt: person.createdAt.toISOString(),
      account: person.user ? { active: person.user.active, lastLoginAt: iso(person.user.lastLoginAt) } : null,
      allyProtectionUntil: person.ownerUntil && person.ownerUntil.getTime() > now ? person.ownerUntil.toISOString() : null,
    },
    missingTreatmentConsent: !consents.current.some((c) => c.purpose === 'TRATAMIENTO' && c.active),
    household: { monthlyIncome: num(person.monthlyIncome), monthlyExpenses: num(person.monthlyExpenses), savings: num(person.savings), goals: person.goals, confidence: confidenceLabel('DECLARED') },
    cases: person.opportunities.map((o) => ({
      id: o.id,
      code: o.code,
      createdAt: o.createdAt.toISOString(),
      product: productLabel(o.product),
      stage: stageLabel(o.stage),
      sla: slaView(o.slaDueAt, now),
      priority: priorityLabel(o.priority),
      assignee: o.assignee?.name ?? null,
      entity: o.entity?.name ?? null,
      channel: channelLabel(o.channel),
      allyOrgName: o.allyOrg?.name ?? null,
      amount: num(o.disbursedAmount ?? o.amount),
    })),
    loans: person.loans.map(loanView),
    properties: person.properties.map(propertyView),
    documents: person.documents.map((d) => {
      const expired = d.status === 'APPROVED' && d.expiresAt && d.expiresAt.toISOString().slice(0, 10) < today;
      return {
        id: d.id,
        type: d.type.name,
        version: d.version,
        status: labelOf(DOC_STATUS, expired ? 'EXPIRED' : d.status),
        createdAt: d.createdAt.toISOString(),
        expiresAt: day(d.expiresAt),
        rejectReason: d.rejectReason,
        viewable: d.status !== 'QUARANTINED' && d.scanResult === 'CLEAN',
      };
    }),
    requests: person.requests.map((r) => ({
      id: r.id,
      code: r.code,
      subject: r.subject,
      kind: plainLabel(Object.fromEntries(Object.entries(REQUEST_KINDS).map(([k, v]) => [k, v.label])), r.kind, 'info'),
      status: labelOf(REQUEST_STATUS, r.status),
      createdAt: r.createdAt.toISOString(),
      slaDueAt: r.slaDueAt.toISOString(),
    })),
    consents: consents.current,
    consentHistory: consents.history,
    revokeChannels: Object.entries(REVOKE_CHANNELS).map(([value, label]) => ({ value, label })),
    can: { revokeConsent: can(session.user.role, 'consent.manage'), createCase: can(session.user.role, 'case.create'), openRequests: can(session.user.role, 'request.manage') },
  };
}
