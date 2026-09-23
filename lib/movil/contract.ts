/**
 * Contrato de la API móvil `/api/movil/v1` (cliente y aliado).
 *
 * Tipos PUROS: sin imports de Prisma, Next ni del servidor, para que la app
 * los importe con `import type { … } from '…/lib/movil/contract'`.
 *
 * Convenciones:
 *  - Montos en pesos colombianos como `number` (enteros salvo que se diga).
 *  - Tasas y porcentajes como FRACCIÓN: 0.12 = 12 %.
 *  - `ISODate` = 'YYYY-MM-DD' (columnas sin hora); `ISODateTime` = ISO 8601 con zona (UTC).
 *  - Nunca viajan datos cifrados: el documento de identidad solo como últimos 4.
 *  - Errores: `{ ok: false, message }` con 400 (cuerpo), 401 (sesión), 403 (perfil o permiso),
 *    404 (no existe o fuera de tu alcance), 409 (cliente sin expediente), 422 (validación de la acción),
 *    423 (documento en antivirus) o 500.
 */

// ── Comunes ──────────────────────────────────────────────────────────────

export type ISODate = string;
export type ISODateTime = string;

export type Confidence = 'DECLARED' | 'ESTIMATED' | 'CONFIRMED';
export type Stage = 'LEAD' | 'CONTACTED' | 'PROFILED' | 'DOCUMENTING' | 'FILED' | 'APPROVED' | 'SIGNED' | 'DISBURSED' | 'POSTSALE' | 'WITHDRAWN';
export type AmortizationSystem = 'FIXED_PESOS' | 'UVR';
export type ExtraPaymentMode = 'TERM' | 'PAYMENT';
export type DocStatus = 'UPLOADED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'QUARANTINED';
export type PaymentStatus = 'REPORTED' | 'IN_REVIEW' | 'VALIDATED' | 'REJECTED' | 'RECONCILED';
export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CLIENT' | 'RESOLVED' | 'REJECTED';
export type CommissionStatus = 'CAUSED' | 'APPROVED' | 'SCHEDULED' | 'PAID' | 'REVERSED';
export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
/** Tono visual sugerido (mismo vocabulario que la web). */
export type Tone = 'ok' | 'info' | 'wait' | 'bad' | 'gray';

export interface StatusLabel {
  code: string;
  label: string;
  tone: string;
}

export interface CodeLabel {
  code: string;
  label: string;
}

export interface SummaryLine {
  label: string;
  value: string;
}

export interface ApiFailure {
  ok: false;
  message: string;
  lockout?: boolean;
}

/**
 * Respuesta de toda MUTACIÓN (reutiliza la server action de la web).
 * 200 si `ok`, 422 si la acción rechazó los datos (el `message` es para mostrar tal cual).
 */
export interface ActionResult {
  ok: boolean;
  message: string;
  at?: number;
  /** Algunas acciones de la web terminan en redirect; aquí llega como dato. */
  redirect?: string;
  /** Enlace de continuación que la web muestra tras el éxito (p. ej. ficha o certificado). */
  href?: string;
  linkLabel?: string;
  /** Id del registro creado cuando aplica (escenario, inmueble, crédito, solicitud, caso, actividad). */
  id?: string;
}

/** Pantallas de la app a las que apunta una recomendación o alerta. */
export type MobileScreen = 'inicio' | 'hogar' | 'vivienda' | 'credito' | 'decidir' | 'gestiones' | 'nueva-solicitud' | 'documentos' | 'asesor';

export interface MobileLink {
  screen: MobileScreen;
  /** decidir → { sim: 'PORTFOLIO' } · nueva-solicitud → { kind: 'HARDSHIP' } · credito/gestiones → { loanId }. */
  params?: Record<string, string>;
  label: string;
}

export interface SlaView {
  dueAt: ISODateTime;
  overdue: boolean;
  /** "2 d 4 h" o "Vencido hace 3 h". */
  text: string;
  tone: 'ok' | 'wait' | 'bad';
}

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  /** Ruta de la web (informativa: la app decide a qué pantalla ir). */
  href: string | null;
  readAt: ISODateTime | null;
  createdAt: ISODateTime;
}

/** GET /notificaciones */
export interface NotificacionesResponse {
  ok: true;
  unread: number;
  items: NotificationView[];
}

/** GET /cliente/documentos/{id}/enlace · GET /aliado/documentos/{id}/enlace */
export interface DocumentLinkResponse {
  ok: true;
  /** Ruta relativa firmada (5 min, solo para este usuario). Pedirla con el mismo `Authorization: Bearer`. */
  url: string;
  absoluteUrl: string;
  expiresAt: ISODateTime;
  mimeType: 'application/pdf';
}

// ── Motor financiero (espejo de lib/finance/types) ──────────────────────

export interface UvrProjection {
  initialValue: number;
  annualInflation: number;
}

/** Estado de un crédito para simular localmente con `lib/finance` (idéntico a `LoanState`). */
export interface MobileLoanState {
  principal: number;
  rateEa: number;
  termMonths: number;
  system: AmortizationSystem;
  monthlyInsurance?: number;
  insuranceRateMonthly?: number;
  startDate: ISODate;
  firstPaymentDate?: ISODate;
  uvr?: UvrProjection;
  balance: number;
  remainingMonths: number;
  asOf: ISODate;
  nextPaymentDate?: ISODate;
  uvrAtAsOf?: number;
}

export interface ParamValue {
  value: number;
  source: string;
  asOf: ISODate;
}

export interface RefRateView {
  rateEa: number;
  source: string;
  asOf: ISODate;
  product: string;
  entityName: string | null;
}

/** GET /cliente/parametros */
export interface ParametrosResponse {
  ok: true;
  today: ISODate;
  engineVersion: string;
  uvr: ParamValue | null;
  /** Inflación proyectada como fracción. */
  inflation: ParamValue | null;
  referenceRates: { FIXED_PESOS: RefRateView | null; UVR: RefRateView | null };
  /** Diferencia mínima de tasa para sugerir compra de cartera (fracción). */
  portfolioRateGap: number;
  notBinding: string;
}

// ── Cliente · inicio ─────────────────────────────────────────────────────

export interface OnboardingFlags {
  goals: boolean;
  household: boolean;
  property: boolean;
  valuation: boolean;
  loan: boolean;
  done: boolean;
}

export interface PatrimonioBlock {
  /** null si ningún inmueble tiene valor registrado. */
  netWorth: number | null;
  totalValue: number;
  totalDebt: number;
  range: { low: number; high: number } | null;
  variation: { amount: number; previousAsOf: ISODate } | null;
  confidence: Confidence | null;
  source: string | null;
  asOf: ISODate | null;
  unvaluedWithLoan: boolean;
  disclaimer: string;
}

export interface AvanceBlock {
  loanId: string;
  alias: string;
  /** Fracción de la vivienda que ya es "tuya" (valor − saldo) / valor; null sin valor. */
  ownership: number | null;
  capitalPaid: number;
  paidInstallments: number;
  termMonths: number;
  remainingMonths: number;
  remainingText: string;
  payoffDate: ISODate | null;
  confidence: Confidence;
  source: string;
  balanceAsOf: ISODate;
  /** En UVR el saldo en pesos puede superar el monto prestado. */
  uvrNote: boolean;
}

export interface CuotaDesglose {
  principal: number;
  interest: number;
  insurance: number;
}

export interface ProximoPagoBlock {
  loanId: string;
  alias: string;
  entityName: string | null;
  dueDate: ISODate;
  amount: number | null;
  breakdown: CuotaDesglose | null;
  status: { code: PaymentStatus | 'NONE'; label: string; tone: string; paidOn: ISODate | null };
  notice: string | null;
  caption: string;
}

export interface NextActionItem {
  code: string;
  title: string;
  reason: string;
  impact: string;
  cta: string;
  requires: string[];
  score: number;
  link: MobileLink;
}

export interface RadarItem {
  tone: 'ok' | 'amber' | 'red' | 'gray';
  title: string;
  detail: string;
  link: MobileLink | null;
}

export interface CasoResumen {
  id: string;
  code: string;
  product: string;
  productLabel: string;
  stage: Stage;
  stageLabel: string;
  /** Qué significa la etapa para el cliente. */
  stageText: string;
  responsible: string;
  entityName: string | null;
  nextAction: string | null;
  sla: SlaView | null;
  missingDocuments: string[];
  stageAt: ISODateTime;
  createdAt: ISODateTime;
}

/** GET /cliente/inicio — los 5 bloques del inicio patrimonial. */
export interface ClienteInicioResponse {
  ok: true;
  hasPerson: boolean;
  firstName: string | null;
  onboarding: OnboardingFlags;
  patrimonio: PatrimonioBlock | null;
  avance: AvanceBlock | null;
  proximaAccion: { best: NextActionItem | null; others: NextActionItem[]; disclaimer: string };
  proximoPago: ProximoPagoBlock | null;
  radar: RadarItem[];
  notices: string[];
  casos: CasoResumen[];
}

// ── Cliente · hogar ──────────────────────────────────────────────────────

/** GET /cliente/hogar. POST con { goals: string[], goalsNote?, monthlyIncome?, monthlyExpenses?, savings?, city? }. */
export interface HogarResponse {
  ok: true;
  goals: Array<{ code: string; label: string; selected: boolean }>;
  goalsNote: string;
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  savings: number | null;
  city: string | null;
  updatedAt: ISODateTime;
  confidence: 'DECLARED';
}

// ── Cliente · vivienda ───────────────────────────────────────────────────

export interface ValuationView {
  id: string;
  value: number;
  low: number | null;
  high: number | null;
  confidence: Confidence;
  source: string;
  methodology: string | null;
  asOf: ISODate;
}

export interface DocumentView {
  id: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  version: number;
  fileName: string;
  status: StatusLabel;
  rejectReason: string | null;
  expiresAt: ISODate | null;
  createdAt: ISODateTime;
  caseCode: string | null;
  /** false mientras está en verificación antivirus (el enlace responde 423). */
  viewable: boolean;
}

export interface PropertyView {
  id: string;
  alias: string;
  address: string | null;
  city: string | null;
  kind: string;
  kindLabel: string;
  stratum: number | null;
  areaM2: number | null;
  isVis: boolean;
  latestValuation: ValuationView | null;
  /** Ascendentes por fecha. */
  valuations: ValuationView[];
  debt: number;
  /** Deuda / valor (fracción). */
  ltv: number | null;
  /** Patrimonio en cada valoración: valor − saldo vigente a esa fecha. */
  series: Array<{ date: ISODate; value: number; net: number; confidence: Confidence }>;
}

/** GET /cliente/vivienda */
export interface ViviendaResponse {
  ok: true;
  properties: PropertyView[];
  appraisalRequests: Array<{ id: string; code: string; status: StatusLabel; createdAt: ISODateTime }>;
  homeDocuments: DocumentView[];
  kinds: CodeLabel[];
  valueBases: CodeLabel[];
}

// ── Cliente · crédito ────────────────────────────────────────────────────

export interface ScheduleRowView {
  n: number;
  date: ISODate;
  openingBalance: number;
  interest: number;
  principal: number;
  insurance: number;
  extra: number;
  payment: number;
  closingBalance: number;
  uvrValue?: number;
}

export interface LoanView {
  id: string;
  alias: string;
  entityId: string | null;
  entityName: string | null;
  propertyId: string | null;
  propertyAlias: string | null;
  system: AmortizationSystem;
  rateEa: number;
  termMonths: number;
  originalAmount: number;
  disbursedAt: ISODate;
  balance: number;
  balanceAsOf: ISODate;
  paidInstallments: number;
  remainingMonths: number;
  monthlyInsurance: number;
  paymentDay: number;
  confidence: Confidence;
  source: string;
}

export interface PaymentView {
  id: string;
  loanId: string;
  loanAlias: string;
  kind: 'INSTALLMENT' | 'PREPAYMENT';
  applyMode: ExtraPaymentMode | null;
  paidOn: ISODate;
  amount: number;
  channel: string;
  reference: string | null;
  status: StatusLabel;
  rejectReason: string | null;
  createdAt: ISODateTime;
  reviewedAt: ISODateTime | null;
}

export interface LoanDetail {
  loan: LoanView;
  /** Estado para simular localmente (null si faltan datos: ver `notices`). */
  state: MobileLoanState | null;
  notices: string[];
  nextPayment: { dueDate: ISODate; row: ScheduleRowView | null };
  monthlyInterestNow: number | null;
  schedule: {
    payoffDate: ISODate;
    months: number;
    basePayment: number;
    totals: { interest: number; insurance: number; principal: number; extra: number; paid: number };
    assumptions: string[];
    warnings: string[];
    engineVersion: string;
  } | null;
  interestAvoided: { amount: number; prepayments: number; prepaidTotal: number };
  table: { page: number; pageCount: number; pageSize: number; rows: ScheduleRowView[] };
  timeline: Array<{ date: ISODate; title: string; detail?: string }>;
  payments: PaymentView[];
}

/** GET /cliente/credito?id=&pagina= */
export interface CreditoResponse {
  ok: true;
  loans: Array<{ id: string; alias: string; entityName: string | null }>;
  selected: LoanDetail | null;
  uvrParams: { uvr: ParamValue | null; inflation: ParamValue | null };
  entities: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; alias: string }>;
}

// ── Cliente · escenarios ─────────────────────────────────────────────────

export type SimKind = 'PREPAYMENT' | 'TERM_CHANGE' | 'PORTFOLIO' | 'FREE_EARLY' | 'EXTRAORDINARY' | 'TARGET_PAYMENT' | 'FIXED_VS_UVR' | 'STRESS' | 'RENT_VS_BUY' | 'SALE';

export interface SimKindMeta {
  kind: SimKind;
  label: string;
  question: string;
  needsLoan: boolean;
}

export interface SimContextView {
  loans: Array<{ id: string; alias: string; state: MobileLoanState | null; notices: string[]; payment: number | null }>;
  household: { income: number | null; expenses: number | null; savings: number | null };
  refRate: { rateEa: number; source: string; asOf: ISODate } | null;
  inflation: ParamValue | null;
  home: { value: number; source: string; asOf: ISODate; confidence: Confidence } | null;
  today: ISODate;
}

export interface ScenarioView {
  id: string;
  kind: string;
  kindLabel: string;
  name: string;
  loanId: string | null;
  createdAt: ISODateTime;
  engineVersion: string;
  inputsHash: string;
  sharedWithAdvisor: boolean;
  params: Record<string, unknown>;
  results: Record<string, unknown>;
  summary: SummaryLine[];
  inputsSummary: SummaryLine[];
  assumptions: string[];
  warnings: string[];
  /** PDF: GET con el mismo Bearer. */
  pdfUrl: string;
}

/** GET /cliente/escenarios */
export interface EscenariosResponse {
  ok: true;
  notBinding: string;
  kinds: SimKindMeta[];
  context: SimContextView;
  scenarios: ScenarioView[];
}

// ── Cliente · gestiones ──────────────────────────────────────────────────

export interface RequestView {
  id: string;
  code: string;
  kind: string;
  kindLabel: string;
  subject: string;
  status: StatusLabel;
  closed: boolean;
  slaDueAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface RequestDetailResponse {
  ok: true;
  request: RequestView & { detail: string; resolution: string | null; canReply: boolean };
  /** Hilo SIN mensajes internos del equipo. */
  messages: Array<{ id: string; mine: boolean; author: string; body: string; createdAt: ISODateTime }>;
}

export interface OfferView {
  id: string;
  entityName: string;
  rateEa: number;
  system: AmortizationSystem;
  termMonths: number;
  amount: number;
  monthlyInsurance: number;
  upfrontCosts: number;
  conditions: string | null;
  validUntil: ISODate | null;
  source: string;
  engineVersion: string;
  createdAt: ISODateTime;
  acceptedAt: ISODateTime | null;
  expired: boolean;
  /** Solo en el portal cliente. */
  canAccept?: boolean;
  summary: SummaryLine[];
}

export interface StageChangeView {
  id: string;
  from: Stage | null;
  to: Stage;
  fromLabel: string | null;
  toLabel: string;
  note?: string | null;
  by?: string;
  createdAt: ISODateTime;
}

export interface CasoDetalle extends CasoResumen {
  withdrawReason: string | null;
  stages: StageChangeView[];
  /** Solo las interacciones marcadas visibles para el cliente. */
  interactions: Array<{ id: string; channel: string; summary: string; createdAt: ISODateTime }>;
  offers: OfferView[];
}

/** GET /cliente/gestiones */
export interface GestionesResponse {
  ok: true;
  loans: Array<{ id: string; label: string }>;
  paymentChannels: string[];
  paymentWarning: string;
  payments: PaymentView[];
  requests: RequestView[];
  requestKinds: Array<{ code: string; label: string; slaHours: number }>;
  cases: CasoDetalle[];
}

// ── Cliente · documentos ─────────────────────────────────────────────────

export interface DocumentTypeView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
}

export interface ChecklistItem {
  type: DocumentTypeView;
  latest: DocumentView | null;
  expired: boolean;
  expiringSoon: boolean;
  needsUpload: boolean;
}

/** GET /cliente/documentos */
export interface DocumentosResponse {
  ok: true;
  notice: string;
  cases: Array<{ id: string; code: string; product: string; productLabel: string; pendingCount: number; items: ChecklistItem[] }>;
  uploadTypes: DocumentTypeView[];
  caseOptions: Array<{ id: string; label: string }>;
  expediente: Array<{ typeId: string; typeName: string; versions: DocumentView[] }>;
  accept: string[];
  maxBytes: number;
}

/** GET /cliente/catalogos */
export interface CatalogosResponse {
  ok: true;
  entities: Array<{ id: string; name: string }>;
  requestKinds: Array<{ code: string; label: string; slaHours: number }>;
  products: CodeLabel[];
  paymentChannels: string[];
  paymentWarning: string;
  documentTypes: Array<DocumentTypeView & { products: string[]; validityDays: number | null }>;
  propertyKinds: CodeLabel[];
  valueBases: CodeLabel[];
  goals: CodeLabel[];
  loanCloseReasons: CodeLabel[];
  simKinds: SimKindMeta[];
  stages: CodeLabel[];
  documentIdTypes: CodeLabel[];
  consentPurposes: Array<{ code: string; title: string; text: string; required: boolean }>;
  interactionChannels: CodeLabel[];
  taskKinds: CodeLabel[];
}

// ── Aliado ───────────────────────────────────────────────────────────────

export interface CertStateView {
  label: string;
  tone: 'ok' | 'wait' | 'bad' | 'gray';
  valid: boolean;
  days: number | null;
}

export interface TaskView {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  detail: string | null;
  dueAt: ISODateTime;
  status: TaskStatus;
  doneAt: ISODateTime | null;
  opportunity: { id: string; code: string } | null;
  /** Presente cuando la tarea es de otro usuario de la organización. */
  assigneeName?: string;
  editable: boolean;
  /** Exportar a calendario (GET con Bearer). */
  icsUrl: string;
}

export interface UrgentCase {
  id: string;
  code: string;
  clientName: string;
  product: string;
  productLabel: string;
  stage: Stage;
  stageLabel: string;
  reason: 'SLA' | 'DOCUMENTOS';
  pending: string;
  sla: SlaView | null;
  missingDocuments: string[];
}

/** GET /aliado/resumen */
export interface AliadoResumenResponse {
  ok: true;
  firstName: string;
  admin: boolean;
  organization: { id: string; name: string; tier: string; tierLabel: string } | null;
  /** Cursos críticos vencidos o pendientes: bloquean radicar. */
  blocking: string[];
  kpis: {
    pipeline: { amount: number; count: number };
    disbursedMonth: { amount: number; goal: number | null; goalPct: number | null };
    commissions: { caused: number; approved: number; paid: number; nextPaymentAt: ISODate | null };
    conversion: { total: number; won: number; lost: number; rate: number | null };
  };
  urgent: UrgentCase[];
  today: TaskView[];
  certifications: Array<{ courseId: string; slug: string; title: string; critical: boolean; state: CertStateView }>;
  notices: NotificationView[];
}

export interface AllyCaseRow {
  id: string;
  code: string;
  clientName: string;
  /** "CC ···1234" */
  document: string;
  product: string;
  productLabel: string;
  entityName: string | null;
  stage: Stage;
  stageLabel: string;
  stageTone: Tone;
  missingDocuments: string[];
  nextAction: string | null;
  sla: SlaView | null;
  amount: number | null;
  disbursedAmount: number | null;
  allyName: string | null;
  updatedAt: ISODateTime;
}

/** GET /aliado/clientes?q=&etapa=&pagina= */
export interface AliadoClientesResponse {
  ok: true;
  admin: boolean;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  items: AllyCaseRow[];
}

export interface AllyChecklistItem {
  type: DocumentTypeView;
  latest: {
    id: string;
    version: number;
    fileName: string;
    status: StatusLabel;
    rejectReason: string | null;
    expiresAt: ISODate | null;
    createdAt: ISODateTime;
    viewable: boolean;
  } | null;
  canUpload: boolean;
}

export interface AllyCommissionView {
  id: string;
  status: StatusLabel;
  baseAmount: number;
  percent: number;
  gross: number;
  withholding: number;
  net: number;
  expectedPayAt: ISODate;
}

/** GET /aliado/clientes/{id} — ficha 360. */
export interface AliadoFichaResponse {
  ok: true;
  case: {
    id: string;
    code: string;
    product: string;
    productLabel: string;
    stage: Stage;
    stageLabel: string;
    closed: boolean;
    pipeline: Array<{ stage: Stage; label: string; done: boolean; current: boolean }>;
    amount: number | null;
    disbursedAmount: number | null;
    entityName: string | null;
    nextAction: string | null;
    sla: SlaView | null;
    withdrawReason: string | null;
    createdAt: ISODateTime;
    stageAt: ISODateTime;
    /** Movimientos que el aliado puede hacer desde la app (POST /etapa). */
    allowedMoves: Array<'CONTACTED' | 'PROFILED' | 'WITHDRAWN'>;
  };
  client: {
    firstName: string;
    lastName: string;
    name: string;
    documentType: string;
    documentTypeLabel: string;
    documentLast4: string;
    email: string | null;
    /** El celular se revela con POST /telefono (queda auditado). */
    hasPhone: boolean;
    city: string | null;
    monthlyIncome: number | null;
    hasAccount: boolean;
    canInvite: boolean;
  };
  registeredBy: { organization: string | null; ally: string | null };
  consents: {
    active: Array<{ code: string; title: string; grantedAt: ISODateTime }>;
    pending: Array<{ code: string; title: string; text: string; required: boolean }>;
    entidades: boolean;
  };
  blocking: string[];
  timeline: StageChangeView[];
  checklist: AllyChecklistItem[];
  requiredMissing: number;
  tasks: TaskView[];
  interactions: Array<{ id: string; channel: string; channelLabel: string; summary: string; visibleToClient: boolean; by: string; createdAt: ISODateTime }>;
  offers: OfferView[];
  commission: AllyCommissionView | null;
}

/** GET /aliado/embudo */
export interface AliadoEmbudoResponse {
  ok: true;
  admin: boolean;
  total: number;
  columns: Array<{
    stage: Stage;
    label: string;
    count: number;
    amount: number;
    more: number;
    cases: Array<{ id: string; code: string; clientName: string; productLabel: string; amount: number | null; disbursedAmount: number | null; daysInStage: number; sla: SlaView | null; allyName: string | null }>;
  }>;
  withdrawn: Array<{ id: string; code: string; clientName: string; productLabel: string; reason: string | null }>;
  conversion: Array<{ stage: Stage; label: string; reached: number; ofPrevious: number | null; avgHoursInStage: number | null }>;
  withdrawal: { count: number; leads: number; rate: number | null; reasons: Array<{ reason: string; count: number }> };
}

/** GET /aliado/agenda */
export interface AliadoAgendaResponse {
  ok: true;
  today: ISODate;
  overdue: TaskView[];
  days: Array<{ date: ISODate; title: string; tasks: TaskView[] }>;
  laterCount: number;
  done: TaskView[];
  caseOptions: Array<{ id: string; code: string; clientName: string }>;
  kinds: CodeLabel[];
}

export interface RuleSnapshotView {
  name: string;
  version: number | null;
  percent: number | null;
  withholdingPct: number | null;
  basis: string | null;
  basisLabel: string;
  paymentDays: number | null;
  validFrom: string | null;
  validTo: string | null;
  scope: string;
}

/** GET /aliado/comisiones */
export interface AliadoComisionesResponse {
  ok: true;
  admin: boolean;
  organization: { id: string; name: string; tier: string; tierLabel: string } | null;
  totals: Array<{ status: CommissionStatus; label: string; count: number; net: number }>;
  commissions: Array<{
    id: string;
    status: StatusLabel;
    baseAmount: number;
    percent: number;
    gross: number;
    withholding: number;
    net: number;
    case: { id: string; code: string; product: string; productLabel: string; clientName: string; entityName: string | null; disbursedAmount: number | null; disbursedAt: ISODateTime | null };
    allyName: string | null;
    /** Foto de la regla al causar: los cambios posteriores no la alteran. */
    rule: RuleSnapshotView;
    causedAt: ISODateTime;
    approvedAt: ISODateTime | null;
    expectedPayAt: ISODate;
    paidAt: ISODateTime | null;
    paymentRef: string | null;
    reversedAt: ISODateTime | null;
    reverseReason: string | null;
  }>;
  exampleBase: number;
  rules: Array<{
    product: string;
    productLabel: string;
    rule: { id: string; name: string; version: number; percent: number; withholdingPct: number; paymentDays: number; validFrom: ISODate; validTo: ISODate | null; exampleNet: number } | null;
  }>;
  csvUrl: string;
}

/** GET /aliado/academia */
export interface AliadoAcademiaResponse {
  ok: true;
  blocking: string[];
  validCount: number;
  courses: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    mandatory: boolean;
    critical: boolean;
    passScore: number;
    lessons: number;
    progress: number;
    attempts: number;
    bestScore: number | null;
    certification: { code: string; expiresAt: ISODateTime } | null;
    state: CertStateView;
  }>;
}

/** GET /aliado/academia/{slug} — preguntas SIN respuesta correcta. */
export interface AliadoCursoResponse {
  ok: true;
  course: { id: string; slug: string; title: string; summary: string; mandatory: boolean; critical: boolean; passScore: number; validityDays: number; version: number };
  lessons: Array<{ index: number; title: string; body: string[]; done: boolean }>;
  progress: number;
  allSeen: boolean;
  /** Responder con POST /evaluacion { answers: number[] } o { a0: 1, a1: 3, … }. */
  quiz: Array<{ index: number; q: string; options: string[] }>;
  attemptsToday: number;
  attemptsLeft: number;
  maxAttemptsPerDay: number;
  certification: { code: string; expiresAt: ISODateTime; state: CertStateView } | null;
}

// ── Equipo (ALLY_ADMIN) · GET /aliado/equipo ────────────────────────────
export interface AliadoEquipoMiembro {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  active: boolean;
  invitePending: boolean;
  lastLoginAt: string | null;
  openCases: number;
  totalCases: number;
  won: number;
  conversion: number | null;
  withdrawal: number | null;
  docQuality: number | null;
  reviewedDocs: number;
  disbursedMonth: number;
  commissionPending: number;
  commissionPaid: number;
  blockingCourses: string[];
}

export interface AliadoEquipoResponse {
  ok: true;
  organization: { id: string; name: string } | null;
  goal: number;
  monthTotal: number;
  hasCriticalCourses: boolean;
  members: AliadoEquipoMiembro[];
  assignable: { id: string; name: string }[];
  activeCases: { id: string; code: string; client: string; allyUserId: string | null; allyName: string | null }[];
}

// ── Público: documentos legales y verificación de certificados ──────────
export interface LegalDocumentResponse {
  ok: true;
  document: { slug: 'privacidad' | 'terminos'; title: string; meta?: string; sections: { heading: string; paragraphs?: string[]; bullets?: { title?: string; text: string }[] }[] };
}

export interface CertificateResponse {
  ok: true;
  certificate: { code: string; holder: string; course: string; courseVersion: number; score: number; issuedAt: string; expiresAt: string; valid: boolean };
}
