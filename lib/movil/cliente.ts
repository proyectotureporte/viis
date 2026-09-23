import type { Document, DocumentType, Offer, PaymentReport, Person } from '@/app/generated/prisma/client';
import { GOALS } from '@/app/(plataforma)/cliente/hogar/goals';
import { PAYMENT_CHANNELS, PAYMENT_WARNING } from '@/app/(plataforma)/cliente/gestiones/channels';
import { PROPERTY_KINDS } from '@/app/(plataforma)/cliente/vivienda/kinds';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { checklist, missingDocuments } from '@/lib/domain/documents';
import { ENGINE_VERSION, nextBestActions, PORTFOLIO_RATE_GAP, type ActionCode, type ScheduleRow } from '@/lib/finance';
import { isoDay, isoText, monthsText, rateText, todayBogota } from '@/lib/cliente/format';
import { ACTION_LINKS } from '@/lib/cliente/nba';
import { getUvrParams, latestReferenceRate } from '@/lib/cliente/server';
import { describeParams, NOT_BINDING, SIM_KINDS, SIM_META, summarizeResults, type SimKind } from '@/lib/cliente/simulate';
import { interestAvoided, lastValuations, loadLoanViews } from '@/lib/cliente/twin';
import {
  DOC_STATUS,
  DOCUMENT_TYPES_ID,
  fechaDia,
  fechaHora,
  money,
  PAYMENT_STATUS,
  PRODUCTS,
  REQUEST_KINDS,
  REQUEST_STATUS,
  STAGE_CLIENT_TEXT,
  STAGE_LABELS,
  STAGES,
  toNumber,
} from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import type { CurrentSession } from '@/lib/security/session';
import { MAX_UPLOAD_BYTES } from '@/lib/storage';
import type {
  CasoDetalle,
  CasoResumen,
  CatalogosResponse,
  ClienteInicioResponse,
  CodeLabel,
  Confidence,
  CreditoResponse,
  DocumentosResponse,
  DocumentTypeView,
  DocumentView,
  EscenariosResponse,
  GestionesResponse,
  HogarResponse,
  LoanDetail,
  MobileLink,
  NextActionItem,
  OfferView,
  ParametrosResponse,
  PaymentView,
  RadarItem,
  RequestDetailResponse,
  RequestView,
  ScheduleRowView,
  ViviendaResponse,
} from './contract';
import { apiSession, ApiError } from './http';
import { day, iso, num, pesosInt, slaOf, statusOf } from './util';

export const NO_PERSON_MESSAGE = 'Tu cuenta aún no tiene expediente. Escríbenos a contacto@viis.app para activarlo.';

/** Sesión del portal cliente y SU expediente (nunca otro). 409 si aún no tiene expediente. */
export async function clientContext(): Promise<{ session: CurrentSession; person: Person }> {
  const session = await apiSession({ portal: 'cliente' });
  const person = await getPrisma().person.findUnique({ where: { userId: session.user.id } });
  if (!person) throw new ApiError(NO_PERSON_MESSAGE, 409);
  return { session, person };
}

// ── Catálogos compartidos ──────────────────────────────────────────────

export const VALUE_BASES: CodeLabel[] = [
  { code: 'PERCEPCION', label: 'Mi percepción del valor' },
  { code: 'OFERTAS_ZONA', label: 'Ofertas de inmuebles similares en la zona' },
  { code: 'AVALUO_PREVIO', label: 'Un avalúo anterior' },
  { code: 'CATASTRAL', label: 'Avalúo catastral (predial)' },
  { code: 'OTRO', label: 'Otra referencia' },
];

const LOAN_CLOSE_REASONS: CodeLabel[] = [
  { code: 'PAID_OFF', label: 'Crédito pagado en su totalidad' },
  { code: 'TRANSFERRED', label: 'Crédito trasladado a otra entidad' },
  { code: 'ERROR', label: 'Registrado por error' },
];

const INTERACTION_CHANNELS: CodeLabel[] = [
  { code: 'LLAMADA', label: 'Llamada' },
  { code: 'VISITA', label: 'Visita' },
  { code: 'WHATSAPP', label: 'WhatsApp' },
  { code: 'CORREO', label: 'Correo' },
  { code: 'NOTA', label: 'Nota interna' },
];

const TASK_KINDS: CodeLabel[] = [
  { code: 'TAREA', label: 'Tarea' },
  { code: 'CITA', label: 'Cita' },
  { code: 'LLAMADA', label: 'Llamada' },
];

const codeLabels = (map: Record<string, string>): CodeLabel[] => Object.entries(map).map(([code, label]) => ({ code, label }));

export function simKinds() {
  return SIM_KINDS.map((kind) => ({ kind, ...SIM_META[kind] }));
}

/** A qué pantalla de la app lleva cada próxima mejor acción. */
const ACTION_SCREENS: Record<ActionCode, Omit<MobileLink, 'label'>> = {
  PONERSE_AL_DIA: { screen: 'nueva-solicitud', params: { kind: 'HARDSHIP' } },
  COMPLETAR_DATO_INGRESOS: { screen: 'hogar' },
  COMPLETAR_DATO_SALDO: { screen: 'credito' },
  COMPLETAR_DOCUMENTO: { screen: 'documentos' },
  RUTA_PREVENTIVA: { screen: 'nueva-solicitud', params: { kind: 'HARDSHIP' } },
  CONSERVAR_LIQUIDEZ: { screen: 'decidir', params: { sim: 'STRESS' } },
  COMPARAR_COMPRA_CARTERA: { screen: 'decidir', params: { sim: 'PORTFOLIO' } },
  REVISAR_SEGURO: { screen: 'asesor' },
  CAMBIAR_FECHA_PAGO: { screen: 'nueva-solicitud', params: { kind: 'TERM_CHANGE' } },
  ABONO_CAPITAL: { screen: 'decidir', params: { sim: 'PREPAYMENT' } },
};

// ── Vistas reutilizables ───────────────────────────────────────────────

export function documentTypeView(t: DocumentType): DocumentTypeView {
  return { id: t.id, code: t.code, name: t.name, description: t.description, required: t.required };
}

export function documentView(d: Document & { type: DocumentType; opportunity?: { code: string } | null }, now = Date.now()): DocumentView {
  const expired = Boolean(d.expiresAt && d.expiresAt.getTime() < now);
  return {
    id: d.id,
    typeId: d.typeId,
    typeCode: d.type.code,
    typeName: d.type.name,
    version: d.version,
    fileName: d.fileName,
    status: expired && d.status !== 'REJECTED' ? { code: 'EXPIRED', label: 'Vencido', tone: 'bad' } : statusOf(DOC_STATUS, d.status),
    rejectReason: d.rejectReason,
    expiresAt: day(d.expiresAt),
    createdAt: d.createdAt.toISOString(),
    caseCode: d.opportunity?.code ?? null,
    viewable: d.status !== 'QUARANTINED' && d.scanResult === 'CLEAN',
  };
}

export function offerView(o: Offer, today: string, extra?: { canAccept?: boolean }): OfferView {
  const results = (o.results ?? {}) as Record<string, unknown>;
  const summary = typeof results.kind === 'string' ? summarizeResults(results.kind, (results.results ?? results) as Record<string, unknown>).slice(0, 6) : [];
  const validUntil = day(o.validUntil);
  return {
    id: o.id,
    entityName: o.entityName,
    rateEa: Number(o.rateEa),
    system: o.system,
    termMonths: o.termMonths,
    amount: toNumber(o.amount),
    monthlyInsurance: toNumber(o.monthlyInsurance),
    upfrontCosts: toNumber(o.upfrontCosts),
    conditions: o.conditions,
    validUntil,
    source: o.source,
    engineVersion: o.engineVersion,
    createdAt: o.createdAt.toISOString(),
    acceptedAt: iso(o.acceptedAt),
    expired: validUntil ? validUntil < today : false,
    ...extra,
    summary,
  };
}

function paymentView(p: PaymentReport & { loan: { alias: string } }): PaymentView {
  return {
    id: p.id,
    loanId: p.loanId,
    loanAlias: p.loan.alias,
    kind: p.kind === 'PREPAYMENT' ? 'PREPAYMENT' : 'INSTALLMENT',
    applyMode: p.applyMode === 'TERM' || p.applyMode === 'PAYMENT' ? p.applyMode : null,
    paidOn: day(p.paidOn),
    amount: toNumber(p.amount),
    channel: p.channel,
    reference: p.reference,
    status: statusOf(PAYMENT_STATUS, p.status),
    rejectReason: p.rejectReason,
    createdAt: p.createdAt.toISOString(),
    reviewedAt: iso(p.reviewedAt),
  };
}

function rowView(r: ScheduleRow): ScheduleRowView {
  return {
    n: r.n,
    date: r.date,
    openingBalance: pesosInt(r.openingBalance),
    interest: pesosInt(r.interest),
    principal: pesosInt(r.principal),
    insurance: pesosInt(r.insurance),
    extra: pesosInt(r.extra),
    payment: pesosInt(r.payment),
    closingBalance: pesosInt(r.closingBalance),
    ...(r.uvrValue !== undefined ? { uvrValue: r.uvrValue } : {}),
  };
}

function requestView(r: { id: string; code: string; kind: string; subject: string; status: string; slaDueAt: Date; createdAt: Date; updatedAt: Date }): RequestView {
  return {
    id: r.id,
    code: r.code,
    kind: r.kind,
    kindLabel: REQUEST_KINDS[r.kind]?.label ?? r.kind,
    subject: r.subject,
    status: statusOf(REQUEST_STATUS, r.status),
    closed: r.status === 'RESOLVED' || r.status === 'REJECTED',
    slaDueAt: r.slaDueAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

type CaseBase = {
  id: string;
  code: string;
  product: string;
  stage: CasoResumen['stage'];
  nextAction: string | null;
  slaDueAt: Date | null;
  stageAt: Date;
  createdAt: Date;
  assignee: { name: string } | null;
  allyUser?: { name: string } | null;
  entity: { name: string } | null;
};

function casoResumen(c: CaseBase, missing: string[]): CasoResumen {
  const open = !['WITHDRAWN', 'DISBURSED', 'POSTSALE'].includes(c.stage);
  return {
    id: c.id,
    code: c.code,
    product: c.product,
    productLabel: PRODUCTS[c.product] ?? c.product,
    stage: c.stage,
    stageLabel: STAGE_LABELS[c.stage],
    stageText: STAGE_CLIENT_TEXT[c.stage],
    responsible: c.assignee?.name ?? c.allyUser?.name ?? 'Por asignar',
    entityName: c.entity?.name ?? null,
    nextAction: c.nextAction,
    sla: open ? slaOf(c.slaDueAt) : null,
    missingDocuments: missing,
    stageAt: c.stageAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
  };
}

// ── GET /cliente/inicio ────────────────────────────────────────────────

const CONF_ORDER: Confidence[] = ['DECLARED', 'ESTIMATED', 'CONFIRMED'];
const EMPTY_ONBOARDING = { goals: false, household: false, property: false, valuation: false, loan: false, done: false };

export async function clienteInicio(session: CurrentSession): Promise<ClienteInicioResponse> {
  const prisma = getPrisma();
  const person = await prisma.person.findUnique({ where: { userId: session.user.id } });
  if (!person) {
    return {
      ok: true,
      hasPerson: false,
      firstName: session.user.name.split(' ')[0] ?? null,
      onboarding: EMPTY_ONBOARDING,
      patrimonio: null,
      avance: null,
      proximaAccion: { best: null, others: [], disclaimer: '' },
      proximoPago: null,
      radar: [],
      notices: [NO_PERSON_MESSAGE],
      casos: [],
    };
  }
  const today = todayBogota();
  const [properties, { views }, opportunities, documents] = await Promise.all([
    prisma.property.findMany({ where: { personId: person.id }, include: { valuations: { orderBy: { asOf: 'desc' }, take: 2 } }, orderBy: { createdAt: 'asc' } }),
    loadLoanViews(person.id, today),
    prisma.opportunity.findMany({
      where: { personId: person.id, stage: { notIn: ['WITHDRAWN'] } },
      include: { assignee: { select: { name: true } }, allyUser: { select: { name: true } }, entity: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.document.findMany({ where: { personId: person.id }, include: { type: true }, orderBy: [{ version: 'desc' }] }),
  ]);

  const activeCases = opportunities.filter((o) => !['DISBURSED', 'POSTSALE'].includes(o.stage));
  const missingByCase = new Map<string, Array<{ id: string; name: string }>>();
  for (const c of activeCases) missingByCase.set(c.id, await missingDocuments(prisma, person.id, c.product));
  const missingNames = [...new Set([...missingByCase.values()].flat().map((t) => t.name))];

  const primary = views[0] ?? null;
  const hasLoan = views.length > 0;
  const hasProperty = properties.length > 0;
  const hasValuation = properties.some((p) => p.valuations.length > 0);
  const hasHousehold = person.monthlyIncome !== null && person.monthlyExpenses !== null;
  const onboarding = {
    goals: Boolean(person.goals),
    household: hasHousehold,
    property: hasProperty,
    valuation: hasValuation,
    loan: hasLoan,
    done: Boolean(person.goals) && hasHousehold && hasProperty && hasValuation && hasLoan,
  };

  // Patrimonio
  const latestVals = properties.map((p) => ({ property: p, ...lastValuations(p.valuations) }));
  const valued = latestVals.filter((v) => v.latest);
  const totalValue = valued.reduce((a, v) => a + toNumber(v.latest!.value), 0);
  const totalDebt = views.reduce((a, v) => a + toNumber(v.loan.balance), 0);
  const unvaluedWithLoan = views.some((v) => v.loan.propertyId && !valued.some((x) => x.property.id === v.loan.propertyId));
  const lowAll = valued.length && valued.every((v) => v.latest!.low !== null) ? valued.reduce((a, v) => a + toNumber(v.latest!.low), 0) : null;
  const highAll = valued.length && valued.every((v) => v.latest!.high !== null) ? valued.reduce((a, v) => a + toNumber(v.latest!.high), 0) : null;
  const withPrev = valued.filter((v) => v.previous);
  const variation = withPrev.reduce((a, v) => a + toNumber(v.latest!.value) - toNumber(v.previous!.value), 0);
  const minConf = valued.length ? CONF_ORDER.find((c) => valued.some((v) => v.latest!.confidence === c)) ?? null : null;
  const valSource = valued.length === 1 ? valued[0].latest!.source : valued.length > 1 ? 'varias fuentes' : null;
  const valAsOf = valued.length ? valued.map((v) => v.latest!.asOf).sort((a, b) => a.getTime() - b.getTime())[0] : null;

  // Avance
  const pLoan = primary?.loan;
  const pBalance = pLoan ? toNumber(pLoan.balance) : 0;
  const linkedVal = pLoan?.propertyId ? valued.find((v) => v.property.id === pLoan.propertyId)?.latest : valued[0]?.latest;
  const ownership = linkedVal && toNumber(linkedVal.value) > 0 ? Math.max(0, Math.min(1, (toNumber(linkedVal.value) - pBalance) / toNumber(linkedVal.value))) : null;

  // Próxima mejor acción
  const refRate = primary ? await latestReferenceRate(primary.loan.system, today) : null;
  const household = {
    income: person.monthlyIncome !== null ? toNumber(person.monthlyIncome) : undefined,
    expenses: person.monthlyExpenses !== null ? toNumber(person.monthlyExpenses) : undefined,
    savings: person.savings !== null ? toNumber(person.savings) : undefined,
  };
  const actions = hasLoan
    ? nextBestActions({
        loanState: primary?.state ?? null,
        referenceRate: refRate ? { rateEa: refRate.rateEa, source: refRate.source, asOf: refRate.asOf } : undefined,
        household,
        missing: activeCases
          .filter((c) => (missingByCase.get(c.id) ?? []).length > 0)
          .map((c) => `${(missingByCase.get(c.id) ?? []).length} documento(s) del caso ${c.code}`),
        paymentsOverdue: false,
      })
    : [];
  const actionItem = (a: (typeof actions)[number]): NextActionItem => ({
    code: a.code,
    title: a.title,
    reason: a.reason,
    impact: a.impact,
    cta: a.cta,
    requires: a.requires,
    score: a.score,
    link: { ...ACTION_SCREENS[a.code], label: ACTION_LINKS[a.code].label ?? a.cta },
  });

  // Próximo pago
  const periodReports = primary
    ? await prisma.paymentReport.findMany({
        where: { loanId: primary.loan.id, kind: 'INSTALLMENT', paidOn: { gt: new Date(`${primary.prevDue}T00:00:00Z`) } },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const periodReport = periodReports.find((r) => r.status !== 'REJECTED') ?? periodReports[0] ?? null;

  // Radar
  const payment = primary?.nextRow?.payment ?? primary?.schedule?.basePayment;
  const ratio = payment && household.income ? payment / household.income : null;
  const latestByType = new Map<string, (typeof documents)[number]>();
  for (const d of documents) if (!latestByType.has(d.typeId)) latestByType.set(d.typeId, d);
  const soon = new Date(`${today}T00:00:00Z`).getTime() + 30 * 86_400_000;
  const docProblems = [...latestByType.values()].filter((d) => d.status === 'REJECTED' || d.status === 'EXPIRED' || (d.expiresAt && d.expiresAt.getTime() <= soon));

  const radar: RadarItem[] = [];
  if (pLoan) {
    const rate = Number(pLoan.rateEa);
    if (!refRate) {
      radar.push({ tone: 'gray', title: 'Tasa sin punto de comparación', detail: 'Aún no hay una tasa de referencia vigente cargada para tu tipo de crédito. No emitimos juicio sin fuente.', link: null });
    } else if (rate - refRate.rateEa >= PORTFOLIO_RATE_GAP) {
      radar.push({
        tone: 'amber',
        title: 'Tu tasa merece revisión',
        detail: `Pagas ${rateText(rate)} EA; la referencia es ${rateText(refRate.rateEa)} EA (${refRate.source}, ${isoText(refRate.asOf)}). Revisa si un traslado compensa sus costos.`,
        link: { screen: 'decidir', params: { sim: 'PORTFOLIO' }, label: 'Simular compra de cartera' },
      });
    } else {
      radar.push({ tone: 'ok', title: 'Tasa en rango', detail: `Pagas ${rateText(rate)} EA; la referencia es ${rateText(refRate.rateEa)} EA (${refRate.source}, ${isoText(refRate.asOf)}).`, link: null });
    }
  }
  if (ratio === null) {
    radar.push({ tone: 'gray', title: 'Capacidad de pago sin calcular', detail: 'Registra los ingresos del hogar para saber qué parte se va en la cuota.', link: { screen: 'hogar', label: 'Completar ingresos' } });
  } else {
    const tone: RadarItem['tone'] = ratio > 0.5 ? 'red' : ratio > 0.3 ? 'amber' : 'ok';
    radar.push({
      tone,
      title: `La cuota es el ${Math.round(ratio * 100)} % de tu ingreso`,
      detail:
        tone === 'ok'
          ? 'Está dentro del 30 % que se usa como referencia en Colombia para vivienda.'
          : 'Supera el 30 % de referencia: tu margen es estrecho. Revisa cómo resistiría tu hogar un imprevisto.',
      link: tone === 'ok' ? null : { screen: 'decidir', params: { sim: 'STRESS' }, label: 'Simular un choque' },
    });
  }
  if (pLoan) {
    const ins = toNumber(pLoan.monthlyInsurance);
    radar.push(
      ins > 0
        ? { tone: 'ok', title: `Seguros: ${money(ins)} al mes`, detail: 'Puedes presentar una póliza propia con coberturas equivalentes si la entidad la acepta.', link: { screen: 'asesor', label: 'Revisar seguros' } }
        : { tone: 'amber', title: 'Seguros sin registrar', detail: 'Los créditos de vivienda suelen incluir seguro de vida e incendio y terremoto. Regístralo para ver la cuota completa.', link: { screen: 'credito', label: 'Completar' } },
    );
  }
  if (docProblems.length || missingNames.length) {
    radar.push({
      tone: docProblems.some((d) => d.status === 'REJECTED' || d.status === 'EXPIRED') ? 'red' : 'amber',
      title: `Documentos: ${missingNames.length} pendientes${docProblems.length ? `, ${docProblems.length} por atender` : ''}`,
      detail: [
        ...docProblems.map((d) => `${d.type.name} (${d.status === 'REJECTED' ? 'rechazado' : d.status === 'EXPIRED' || (d.expiresAt && isoDay(d.expiresAt) < today) ? 'vencido' : `vence ${fechaDia(d.expiresAt)}`})`),
        ...missingNames,
      ]
        .slice(0, 4)
        .join(' · '),
      link: { screen: 'documentos', label: 'Ver documentos' },
    });
  } else if (documents.length) {
    radar.push({ tone: 'ok', title: 'Documentos al día', detail: 'No tienes documentos rechazados, vencidos ni pendientes.', link: null });
  }

  return {
    ok: true,
    hasPerson: true,
    firstName: person.firstName,
    onboarding,
    patrimonio:
      hasProperty || hasLoan
        ? {
            netWorth: valued.length ? totalValue - totalDebt : null,
            totalValue,
            totalDebt,
            range: lowAll !== null && highAll !== null ? { low: lowAll, high: highAll } : null,
            variation: withPrev.length ? { amount: variation, previousAsOf: day(withPrev[0].previous!.asOf) } : null,
            confidence: minConf,
            source: valSource,
            asOf: day(valAsOf),
            unvaluedWithLoan,
            disclaimer: 'Estimación, no avalúo oficial.',
          }
        : null,
    avance: pLoan
      ? {
          loanId: pLoan.id,
          alias: pLoan.alias,
          ownership,
          capitalPaid: toNumber(pLoan.originalAmount) - pBalance,
          paidInstallments: pLoan.paidInstallments,
          termMonths: pLoan.termMonths,
          remainingMonths: pLoan.termMonths - pLoan.paidInstallments,
          remainingText: monthsText(pLoan.termMonths - pLoan.paidInstallments),
          payoffDate: primary?.schedule?.payoffDate ?? null,
          confidence: pLoan.confidence,
          source: pLoan.source,
          balanceAsOf: day(pLoan.balanceAsOf),
          uvrNote: pLoan.system === 'UVR' && toNumber(pLoan.originalAmount) - pBalance < 0,
        }
      : null,
    proximaAccion: {
      best: actions[0] ? actionItem(actions[0]) : null,
      others: actions.slice(1, 5).map(actionItem),
      disclaimer: 'Priorizamos por urgencia, beneficio y factibilidad con tus datos declarados. Es orientación, no asesoría obligatoria: puedes pedir revisión humana.',
    },
    proximoPago: primary
      ? {
          loanId: primary.loan.id,
          alias: primary.loan.alias,
          entityName: primary.loan.entity?.name ?? null,
          dueDate: primary.due,
          amount: primary.nextRow ? pesosInt(primary.nextRow.payment) : null,
          breakdown: primary.nextRow
            ? { principal: pesosInt(primary.nextRow.principal), interest: pesosInt(primary.nextRow.interest), insurance: pesosInt(primary.nextRow.insurance) }
            : null,
          status: periodReport
            ? { code: periodReport.status, label: PAYMENT_STATUS[periodReport.status].label, tone: PAYMENT_STATUS[periodReport.status].tone, paidOn: day(periodReport.paidOn) }
            : { code: 'NONE', label: 'Sin pago reportado en este periodo', tone: 'gray', paidOn: null },
          notice: primary.nextRow ? null : primary.notices[0] ?? 'Completa los datos del crédito para estimar la cuota.',
          caption: 'Cuota estimada por el motor OpenV; tu extracto puede variar unos pesos.',
        }
      : null,
    radar,
    notices: primary?.notices ?? [],
    casos: activeCases.map((c) => casoResumen(c, (missingByCase.get(c.id) ?? []).map((m) => m.name))),
  };
}

// ── GET /cliente/hogar ─────────────────────────────────────────────────

export function clienteHogar(person: Person): HogarResponse {
  const [picked, note] = (person.goals ?? '').split(' | ');
  const pickedLabels = new Set((picked ?? '').split('; ').filter(Boolean));
  const freeNote = note ?? (picked && !GOALS.some((g) => pickedLabels.has(g.label)) ? picked : '');
  return {
    ok: true,
    goals: GOALS.map((g) => ({ code: g.code, label: g.label, selected: pickedLabels.has(g.label) })),
    goalsNote: freeNote,
    monthlyIncome: num(person.monthlyIncome),
    monthlyExpenses: num(person.monthlyExpenses),
    savings: num(person.savings),
    city: person.city,
    updatedAt: person.updatedAt.toISOString(),
    confidence: 'DECLARED',
  };
}

// ── GET /cliente/vivienda ──────────────────────────────────────────────

const HOME_DOCS = ['CTL', 'AVALUO', 'POLIZA'];

export async function clienteVivienda(person: Person): Promise<ViviendaResponse> {
  const prisma = getPrisma();
  const [properties, loans, homeDocs, appraisals] = await Promise.all([
    prisma.property.findMany({ where: { personId: person.id }, include: { valuations: { orderBy: { asOf: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    prisma.loan.findMany({ where: { personId: person.id, active: true }, include: { history: { orderBy: { createdAt: 'asc' } } } }),
    prisma.document.findMany({ where: { personId: person.id, type: { code: { in: HOME_DOCS } } }, include: { type: true }, orderBy: [{ createdAt: 'desc' }] }),
    prisma.serviceRequest.findMany({ where: { personId: person.id, subject: { startsWith: 'Avalúo comercial formal' } }, orderBy: { createdAt: 'desc' }, take: 3 }),
  ]);

  const balanceAt = (loan: (typeof loans)[number], date: string): number => {
    const snaps = loan.history
      .map((s) => s.data as Record<string, unknown>)
      .filter((d) => typeof d.balanceAsOf === 'string' && (d.balanceAsOf as string) <= date && typeof d.balance === 'string');
    if (snaps.length) return Number(snaps[snaps.length - 1].balance);
    return toNumber(loan.balance);
  };

  return {
    ok: true,
    properties: properties.map((property) => {
      const { latest } = lastValuations(property.valuations);
      const linkedLoans = loans.filter((l) => l.propertyId === property.id);
      const debtLoans = linkedLoans.length ? linkedLoans : properties.length === 1 ? loans.filter((l) => !l.propertyId) : [];
      const debt = debtLoans.reduce((a, l) => a + toNumber(l.balance), 0);
      const value = latest ? toNumber(latest.value) : null;
      const valuation = (v: (typeof property.valuations)[number]) => ({
        id: v.id,
        value: toNumber(v.value),
        low: num(v.low),
        high: num(v.high),
        confidence: v.confidence,
        source: v.source,
        methodology: v.methodology,
        asOf: day(v.asOf),
      });
      return {
        id: property.id,
        alias: property.alias,
        address: property.address,
        city: property.city,
        kind: property.kind,
        kindLabel: PROPERTY_KINDS[property.kind] ?? property.kind,
        stratum: property.stratum,
        areaM2: num(property.areaM2),
        isVis: property.isVis,
        latestValuation: latest ? valuation(latest) : null,
        valuations: property.valuations.map(valuation),
        debt,
        ltv: value && value > 0 ? debt / value : null,
        series: property.valuations.map((v) => {
          const date = day(v.asOf);
          return { date, value: toNumber(v.value), net: toNumber(v.value) - debtLoans.reduce((a, l) => a + balanceAt(l, date), 0), confidence: v.confidence };
        }),
      };
    }),
    appraisalRequests: appraisals.map((a) => ({ id: a.id, code: a.code, status: statusOf(REQUEST_STATUS, a.status), createdAt: a.createdAt.toISOString() })),
    homeDocuments: homeDocs.map((d) => documentView(d)),
    kinds: codeLabels(PROPERTY_KINDS),
    valueBases: VALUE_BASES,
  };
}

// ── GET /cliente/credito ───────────────────────────────────────────────

const CREDIT_PAGE_SIZE = 24;

export async function clienteCredito(person: Person, selectedId: string | null, pageRaw: number): Promise<CreditoResponse> {
  const prisma = getPrisma();
  const today = todayBogota();
  const [{ views, params: uvrParams }, entities, properties] = await Promise.all([
    loadLoanViews(person.id, today),
    prisma.entity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.property.findMany({ where: { personId: person.id }, select: { id: true, alias: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  const base = {
    ok: true as const,
    loans: views.map((v) => ({ id: v.loan.id, alias: v.loan.alias, entityName: v.loan.entity?.name ?? null })),
    uvrParams,
    entities,
    properties,
  };
  if (!views.length) return { ...base, selected: null };
  if (selectedId && !views.some((v) => v.loan.id === selectedId)) throw new ApiError('Crédito no encontrado.', 404);

  const view = views.find((v) => v.loan.id === selectedId) ?? views[0];
  const { loan, state, schedule, notices, nextRow } = view;
  const [snapshots, payments] = await Promise.all([
    prisma.loanSnapshot.findMany({ where: { loanId: loan.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.paymentReport.findMany({ where: { loanId: loan.id }, include: { loan: { select: { alias: true } } }, orderBy: { paidOn: 'desc' }, take: 50 }),
  ]);
  const validatedPrepayments = payments.filter((p) => p.kind === 'PREPAYMENT' && (p.status === 'VALIDATED' || p.status === 'RECONCILED'));
  const avoided = state ? interestAvoided(state, validatedPrepayments) : 0;
  const pageCount = schedule ? Math.ceil(schedule.rows.length / CREDIT_PAGE_SIZE) : 0;
  const page = pageRaw >= 1 && pageRaw <= pageCount ? pageRaw : 1;

  const timeline: LoanDetail['timeline'] = [
    { date: day(loan.disbursedAt), title: 'Desembolso', detail: `${money(loan.originalAmount)} a ${loan.termMonths} meses` },
    ...snapshots.map((s) => ({ date: day(s.createdAt), title: s.reason, detail: `Registrado ${fechaHora(s.createdAt)}` })),
    ...payments
      .filter((p) => p.status === 'VALIDATED' || p.status === 'RECONCILED')
      .map((p) => ({ date: day(p.paidOn), title: p.kind === 'PREPAYMENT' ? `Abono a capital validado: ${money(p.amount)}` : `Cuota validada: ${money(p.amount)}` })),
  ];
  if (schedule) timeline.push({ date: schedule.payoffDate, title: 'Terminación estimada', detail: 'Si pagas las cuotas como están hoy.' });
  timeline.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const monthlyInterestNow = nextRow?.interest ?? schedule?.rows[0]?.interest;
  const selected: LoanDetail = {
    loan: {
      id: loan.id,
      alias: loan.alias,
      entityId: loan.entityId,
      entityName: loan.entity?.name ?? null,
      propertyId: loan.propertyId,
      propertyAlias: loan.property?.alias ?? null,
      system: loan.system,
      rateEa: Number(loan.rateEa),
      termMonths: loan.termMonths,
      originalAmount: toNumber(loan.originalAmount),
      disbursedAt: day(loan.disbursedAt),
      balance: toNumber(loan.balance),
      balanceAsOf: day(loan.balanceAsOf),
      paidInstallments: loan.paidInstallments,
      remainingMonths: loan.termMonths - loan.paidInstallments,
      monthlyInsurance: toNumber(loan.monthlyInsurance),
      paymentDay: loan.paymentDay,
      confidence: loan.confidence,
      source: loan.source,
    },
    state,
    notices: [
      `Supuesto del cálculo: el saldo que registraste corresponde al corte de tu última cuota (día ${loan.paymentDay}); las cifras son estimaciones del motor OpenV con tus datos declarados.`,
      ...notices,
    ],
    nextPayment: { dueDate: view.due, row: nextRow ? rowView(nextRow) : null },
    monthlyInterestNow: monthlyInterestNow !== undefined ? pesosInt(monthlyInterestNow) : null,
    schedule: schedule
      ? {
          payoffDate: schedule.payoffDate,
          months: schedule.months,
          basePayment: pesosInt(schedule.basePayment),
          totals: {
            interest: pesosInt(schedule.totals.interest),
            insurance: pesosInt(schedule.totals.insurance),
            principal: pesosInt(schedule.totals.principal),
            extra: pesosInt(schedule.totals.extra),
            paid: pesosInt(schedule.totals.paid),
          },
          assumptions: schedule.assumptions,
          warnings: schedule.warnings,
          engineVersion: schedule.engineVersion,
        }
      : null,
    interestAvoided: { amount: pesosInt(avoided), prepayments: validatedPrepayments.length, prepaidTotal: validatedPrepayments.reduce((a, p) => a + toNumber(p.amount), 0) },
    table: {
      page,
      pageCount,
      pageSize: CREDIT_PAGE_SIZE,
      rows: schedule ? schedule.rows.slice((page - 1) * CREDIT_PAGE_SIZE, page * CREDIT_PAGE_SIZE).map(rowView) : [],
    },
    timeline,
    payments: payments.map(paymentView),
  };
  return { ...base, selected };
}

// ── GET /cliente/escenarios y /cliente/parametros ──────────────────────

export async function clienteEscenarios(session: CurrentSession, person: Person): Promise<EscenariosResponse> {
  const prisma = getPrisma();
  const today = todayBogota();
  const [{ views, params: uvrParams }, scenarios, home] = await Promise.all([
    loadLoanViews(person.id, today),
    prisma.scenario.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.propertyValuation.findFirst({ where: { property: { personId: person.id } }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }] }),
  ]);
  const refRate = await latestReferenceRate(views[0]?.loan.system ?? 'FIXED_PESOS', today);
  return {
    ok: true,
    notBinding: NOT_BINDING,
    kinds: simKinds(),
    context: {
      loans: views.map((v) => ({
        id: v.loan.id,
        alias: v.loan.alias,
        state: v.state,
        notices: v.notices,
        payment: v.nextRow?.payment ?? v.schedule?.basePayment ?? null,
      })),
      household: { income: num(person.monthlyIncome), expenses: num(person.monthlyExpenses), savings: num(person.savings) },
      refRate: refRate ? { rateEa: refRate.rateEa, source: refRate.source, asOf: refRate.asOf } : null,
      inflation: uvrParams.inflation,
      home: home ? { value: toNumber(home.value), source: home.source, asOf: day(home.asOf), confidence: home.confidence } : null,
      today,
    },
    scenarios: scenarios.map((s) => {
      const inputs = (s.inputs ?? {}) as { params?: Record<string, unknown> };
      const results = (s.results ?? {}) as Record<string, unknown>;
      const assumptions = (s.assumptions ?? {}) as { assumptions?: unknown; warnings?: unknown };
      const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      return {
        id: s.id,
        kind: s.kind,
        kindLabel: SIM_META[s.kind as SimKind]?.label ?? s.kind,
        name: s.name,
        loanId: s.loanId,
        createdAt: s.createdAt.toISOString(),
        engineVersion: s.engineVersion,
        inputsHash: s.inputsHash,
        sharedWithAdvisor: s.sharedWithAdvisor,
        params: inputs.params ?? {},
        results,
        summary: summarizeResults(s.kind, results),
        inputsSummary: describeParams(s.kind, inputs.params ?? {}),
        assumptions: strings(assumptions.assumptions),
        warnings: strings(assumptions.warnings),
        pdfUrl: `/api/escenarios/${s.id}/pdf`,
      };
    }),
  };
}

export async function clienteParametros(): Promise<ParametrosResponse> {
  const today = todayBogota();
  const [params, fixed, uvr] = await Promise.all([getUvrParams(), latestReferenceRate('FIXED_PESOS', today), latestReferenceRate('UVR', today)]);
  return {
    ok: true,
    today,
    engineVersion: ENGINE_VERSION,
    uvr: params.uvr,
    inflation: params.inflation,
    referenceRates: { FIXED_PESOS: fixed, UVR: uvr },
    portfolioRateGap: PORTFOLIO_RATE_GAP,
    notBinding: NOT_BINDING,
  };
}

// ── GET /cliente/gestiones y /cliente/solicitudes/{id} ─────────────────

export async function clienteGestiones(person: Person): Promise<GestionesResponse> {
  const prisma = getPrisma();
  const today = todayBogota();
  const [loans, payments, requests, cases] = await Promise.all([
    prisma.loan.findMany({ where: { personId: person.id, active: true }, include: { entity: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.paymentReport.findMany({ where: { loan: { personId: person.id } }, include: { loan: { select: { alias: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.serviceRequest.findMany({ where: { personId: person.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.opportunity.findMany({
      where: { personId: person.id },
      include: {
        stages: { orderBy: { createdAt: 'asc' } },
        interactions: { where: { visibleToClient: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        offers: { orderBy: { createdAt: 'desc' } },
        assignee: { select: { name: true } },
        entity: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const open = cases.filter((c) => !['WITHDRAWN', 'DISBURSED', 'POSTSALE'].includes(c.stage));
  const missing = new Map<string, string[]>();
  for (const c of open) missing.set(c.id, (await missingDocuments(prisma, person.id, c.product)).map((t) => t.name));

  return {
    ok: true,
    loans: loans.map((l) => ({ id: l.id, label: `${l.alias}${l.entity ? ` · ${l.entity.name}` : ''}` })),
    paymentChannels: PAYMENT_CHANNELS,
    paymentWarning: PAYMENT_WARNING,
    payments: payments.map(paymentView),
    requests: requests.map(requestView),
    requestKinds: Object.entries(REQUEST_KINDS).map(([code, k]) => ({ code, label: k.label, slaHours: k.slaHours })),
    cases: cases.map((c): CasoDetalle => ({
      ...casoResumen({ ...c, allyUser: null }, missing.get(c.id) ?? []),
      responsible: c.assignee?.name ?? 'Por asignar',
      withdrawReason: c.withdrawReason,
      stages: c.stages.map((s) => ({ id: s.id, from: s.from, to: s.to, fromLabel: s.from ? STAGE_LABELS[s.from] : null, toLabel: STAGE_LABELS[s.to], createdAt: s.createdAt.toISOString() })),
      interactions: c.interactions.map((i) => ({ id: i.id, channel: i.channel, summary: i.summary, createdAt: i.createdAt.toISOString() })),
      offers: c.offers.map((o) => {
        const view = offerView(o, today);
        const otherAccepted = c.offers.some((x) => x.id !== o.id && x.acceptedAt);
        return { ...view, canAccept: !o.acceptedAt && !view.expired && !otherAccepted && c.stage !== 'WITHDRAWN' };
      }),
    })),
  };
}

export async function clienteSolicitud(session: CurrentSession, person: Person, id: string): Promise<RequestDetailResponse> {
  const prisma = getPrisma();
  const request = await prisma.serviceRequest.findFirst({ where: { id, personId: person.id } });
  if (!request) throw new ApiError('Solicitud no encontrada.', 404);
  const thread = await prisma.requestMessage.findMany({ where: { requestId: request.id, internal: false }, orderBy: { createdAt: 'asc' } });
  const authorIds = [...new Set(thread.map((m) => m.byUserId))];
  const authors = authorIds.length ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }) : [];
  const view = requestView(request);
  return {
    ok: true,
    request: { ...view, detail: request.detail, resolution: request.resolution, canReply: !view.closed },
    messages: thread.map((m) => {
      const mine = m.byUserId === session.user.id;
      return { id: m.id, mine, author: mine ? 'Tú' : `${authors.find((a) => a.id === m.byUserId)?.name ?? 'Equipo OpenV'} · OpenV`, body: m.body, createdAt: m.createdAt.toISOString() };
    }),
  };
}

// ── GET /cliente/documentos ────────────────────────────────────────────

export async function clienteDocumentos(person: Person): Promise<DocumentosResponse> {
  const prisma = getPrisma();
  const [cases, types, documents] = await Promise.all([
    prisma.opportunity.findMany({ where: { personId: person.id, stage: { notIn: ['WITHDRAWN', 'DISBURSED', 'POSTSALE'] } }, orderBy: { createdAt: 'desc' } }),
    prisma.documentType.findMany({ where: { active: true, code: { not: 'SOPORTE_PAGO' } }, orderBy: { sortOrder: 'asc' } }),
    prisma.document.findMany({ where: { personId: person.id }, include: { type: true, opportunity: { select: { code: true } } }, orderBy: [{ typeId: 'asc' }, { version: 'desc' }] }),
  ]);
  const lists = await Promise.all(cases.map(async (c) => ({ case: c, items: await checklist(prisma, person.id, c.product) })));
  const nowMs = new Date(`${todayBogota()}T00:00:00Z`).getTime();
  const soon = nowMs + 30 * 86_400_000;
  const byType = new Map<string, typeof documents>();
  for (const d of documents) byType.set(d.typeId, [...(byType.get(d.typeId) ?? []), d]);

  return {
    ok: true,
    notice: 'Tus archivos se guardan cifrados y pasan por antivirus. Solo tú y el equipo que gestiona tu caso pueden verlos, y cada apertura queda registrada con marca de agua.',
    cases: lists.map(({ case: c, items }) => {
      const mapped = items.map(({ type, latest }) => {
        const expired = Boolean(latest?.expiresAt && latest.expiresAt.getTime() < nowMs);
        const expiringSoon = Boolean(latest?.expiresAt && !expired && latest.expiresAt.getTime() < soon);
        const needsUpload = !latest || latest.status === 'REJECTED' || latest.status === 'EXPIRED' || expired;
        return { type: documentTypeView(type), latest: latest ? documentView({ ...latest, type }, nowMs) : null, expired, expiringSoon, needsUpload };
      });
      return {
        id: c.id,
        code: c.code,
        product: c.product,
        productLabel: PRODUCTS[c.product] ?? c.product,
        pendingCount: mapped.filter((i) => i.type.required && i.needsUpload).length,
        items: mapped,
      };
    }),
    uploadTypes: types.map(documentTypeView),
    caseOptions: cases.map((c) => ({ id: c.id, label: `${c.code} · ${PRODUCTS[c.product] ?? c.product}` })),
    expediente: [...byType.values()].map((versions) => ({ typeId: versions[0].typeId, typeName: versions[0].type.name, versions: versions.map((d) => documentView(d, nowMs)) })),
    accept: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: MAX_UPLOAD_BYTES,
  };
}

// ── GET /cliente/catalogos ─────────────────────────────────────────────

export async function catalogos(): Promise<CatalogosResponse> {
  const prisma = getPrisma();
  const [entities, types] = await Promise.all([
    prisma.entity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.documentType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return {
    ok: true,
    entities,
    requestKinds: Object.entries(REQUEST_KINDS).map(([code, k]) => ({ code, label: k.label, slaHours: k.slaHours })),
    products: codeLabels(PRODUCTS),
    paymentChannels: PAYMENT_CHANNELS,
    paymentWarning: PAYMENT_WARNING,
    documentTypes: types.map((t) => ({ ...documentTypeView(t), products: t.products, validityDays: t.validityDays })),
    propertyKinds: codeLabels(PROPERTY_KINDS),
    valueBases: VALUE_BASES,
    goals: GOALS.map((g) => ({ code: g.code, label: g.label })),
    loanCloseReasons: LOAN_CLOSE_REASONS,
    simKinds: simKinds(),
    stages: STAGES.map((s) => ({ code: s, label: STAGE_LABELS[s] })),
    documentIdTypes: ['CC', 'CE', 'PPT', 'PA'].map((code) => ({ code, label: DOCUMENT_TYPES_ID[code] ?? code })),
    consentPurposes: CONSENT_PURPOSES.map((p) => ({ code: p.code, title: p.title, text: p.text, required: p.required })),
    interactionChannels: INTERACTION_CHANNELS,
    taskKinds: TASK_KINDS,
  };
}

export { INTERACTION_CHANNELS, TASK_KINDS };
