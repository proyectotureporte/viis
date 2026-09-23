/**
 * Contrato de la API móvil de la CONSOLA DE EMPRESA: `/api/movil/v1/empresa/**`.
 *
 * Tipos PUROS (sin imports de Prisma, Next ni del servidor): la app los importa con
 * `import type { … } from '…/lib/movil/contract-empresa'`.
 *
 * Convenciones:
 *  - Montos en pesos colombianos como `number` (enteros).
 *  - Tasas y porcentajes como FRACCIÓN: 0.125 = 12,5 %. Los `ratio` también (0–1).
 *  - `ISODate` = 'YYYY-MM-DD' (columnas sin hora); `ISODateTime` = ISO 8601 UTC.
 *  - El documento de identidad SOLO viaja como últimos 4 (`documentLast4`). El número
 *    completo se obtiene con los endpoints `…/documento-completo` (auditados).
 *  - Paginación: `?pagina=N` (también se acepta `?p=N` como en la web). Filtros con los
 *    MISMOS nombres de querystring que la web.
 *  - Errores: `{ ok: false, message }` con 400 (cuerpo inválido), 401 (sin sesión o vencida),
 *    403 (sin permiso), 404 (no existe o fuera de tu alcance), 422 (la acción rechazó los datos:
 *    mostrar `message` tal cual), 423 (documento en verificación antivirus) o 500.
 *  - Mutaciones: cuerpo JSON (o multipart) con los MISMOS nombres de campo del formulario web;
 *    arreglos → campo repetido; `true` → casilla marcada. Responden `ActionResult`.
 */

// ── Comunes ──────────────────────────────────────────────────────────────

export type ISODate = string;
export type ISODateTime = string;

export type Tone = 'ok' | 'info' | 'wait' | 'bad' | 'gray';
export type Stage = 'LEAD' | 'CONTACTED' | 'PROFILED' | 'DOCUMENTING' | 'FILED' | 'APPROVED' | 'SIGNED' | 'DISBURSED' | 'POSTSALE' | 'WITHDRAWN';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type CaseChannel = 'DIRECTO' | 'ALIADO' | 'WEB';
export type AmortizationSystem = 'FIXED_PESOS' | 'UVR';
export type Confidence = 'CONFIRMED' | 'ESTIMATED' | 'DECLARED';
export type DocStatus = 'UPLOADED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'QUARANTINED';
export type PaymentStatus = 'REPORTED' | 'IN_REVIEW' | 'VALIDATED' | 'REJECTED' | 'RECONCILED';
export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CLIENT' | 'RESOLVED' | 'REJECTED';
export type CommissionStatus = 'CAUSED' | 'APPROVED' | 'SCHEDULED' | 'PAID' | 'REVERSED';
export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type Role = 'CLIENT' | 'ALLY' | 'ALLY_ADMIN' | 'ADVISOR' | 'DOC_ANALYST' | 'FIN_ANALYST' | 'COORDINATOR' | 'POSTSALE' | 'TREASURY' | 'COMPLIANCE' | 'ADMIN' | 'DIRECTOR';
export type StaffRole = Exclude<Role, 'CLIENT' | 'ALLY' | 'ALLY_ADMIN'>;
export type Permission =
  | 'case.create' | 'case.read' | 'case.assign' | 'case.stage' | 'case.note' | 'offer.manage' | 'lead.manage'
  | 'person.create' | 'person.read' | 'doc.upload' | 'doc.review' | 'payment.report' | 'payment.review' | 'loan.manage'
  | 'request.create' | 'request.manage' | 'commission.read' | 'commission.rules' | 'commission.approve' | 'commission.pay'
  | 'academy.take' | 'academy.manage' | 'ally.manage' | 'user.manage' | 'catalog.manage' | 'audit.read' | 'analytics.read' | 'consent.manage';

/** Código + texto humano + tono visual (mismo vocabulario que la web). */
export interface LabelView {
  code: string;
  label: string;
  tone: Tone;
}

/** Opción de un selector (catálogos para formularios). */
export interface OptionView {
  value: string;
  label: string;
}

export interface UserRef {
  id: string;
  name: string;
}

export interface StaffOption {
  id: string;
  name: string;
  role: StaffRole;
  roleLabel: string;
}

/** Semáforo de SLA. `text` = "2 h 14 min" / "Vencido hace 3 h". */
export interface SlaView {
  dueAt: ISODateTime | null;
  overdue: boolean;
  text: string;
  tone: Tone;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

/** Respuesta de toda MUTACIÓN. 200 si `ok`, 422 si la acción rechazó los datos. */
export interface ActionResult {
  ok: boolean;
  message: string;
  at?: number;
  /** Ruta web a la que la acción redirigiría (p. ej. `/empresa/casos/{id}`). */
  redirect?: string;
  /** Id del registro creado cuando aplica (caso nuevo). */
  id?: string;
}

/** Resultado de una operación aplicada a varios registros (p. ej. prioridad masiva). */
export interface BulkActionResult {
  ok: boolean;
  message: string;
  results: Array<{ id: string; ok: boolean; message: string }>;
}

/** `GET …/enlace`: URL firmada de 5 min (relativa y absoluta). Se abre con el MISMO Bearer. */
export interface DocumentLinkResponse {
  ok: true;
  url: string;
  absoluteUrl: string;
  expiresAt: ISODateTime;
  mimeType: 'application/pdf';
}

// ── Menú y operación ────────────────────────────────────────────────────

export type AreaKey =
  | 'operacion' | 'bandeja' | 'leads' | 'clientes' | 'documentos' | 'pagos' | 'solicitudes'
  | 'aliados' | 'comisiones' | 'analitica' | 'auditoria' | 'catalogos' | 'usuarios';

export interface MenuArea {
  key: AreaKey;
  label: string;
  /** Nombre del icono lucide (mismo de la web). */
  icon: string;
  group: string;
  /** Permiso que exige el área (null = todo el personal interno). */
  permission: Permission | null;
  /** La web la marca como pestaña de la barra inferior móvil. */
  mobile: boolean;
  /** Endpoint principal del área, relativo a `/api/movil/v1`. */
  endpoint: string;
  /** Contador para el badge (null = sin contador). */
  badge: number | null;
  badgeHint: string | null;
}

export interface MenuResponse {
  ok: true;
  user: { id: string; name: string; email: string; role: Role; roleLabel: string };
  permissions: Permission[];
  areas: MenuArea[];
  unreadNotifications: number;
}

export interface UrgentCaseRow {
  id: string;
  code: string;
  clientName: string;
  stage: LabelView;
  priority: LabelView;
  assignee: UserRef | null;
  sla: SlaView;
}

export interface MyTaskRow {
  id: string;
  title: string;
  kind: LabelView;
  dueAt: ISODateTime;
  overdue: boolean;
  case: { id: string; code: string; clientName: string } | null;
}

export interface OperacionResponse {
  ok: true;
  /** Nota de alcance (el ASESOR solo ve sus casos y los que no tienen responsable). */
  scopeNote: string | null;
  monthLabel: string;
  alerts: { overdue: number; dueSoon: number; dueSoonHours: 8 };
  kpis: {
    pipeline: { amount: number; count: number };
    disbursedMonth: { amount: number; count: number; allyGoal: number; goalRatio: number | null };
    conversion: { ratio: number | null; filed: number; disbursed: number; windowDays: 180; definition: string };
    sla: { ratio: number | null; met: number; closed: number; windowDays: 30; target: number };
  };
  urgentCases: UrgentCaseRow[];
  myTasks: MyTaskRow[];
  funnel: Array<{ stage: Stage; label: string; value: number }>;
  byChannel: Array<{ channel: CaseChannel; label: string; open: number; amount: number; disbursedMonth: number; disbursedMonthAmount: number }>;
  can: { readCases: boolean; createCase: boolean };
}

// ── Bandeja ─────────────────────────────────────────────────────────────

export interface CaseRow {
  id: string;
  code: string;
  client: { name: string; documentLast4: string };
  product: LabelView;
  nextAction: string | null;
  stage: LabelView;
  stageAt: ISODateTime;
  priority: LabelView;
  escalatedAt: ISODateTime | null;
  assignee: UserRef | null;
  sla: SlaView;
  entity: { id: string; name: string } | null;
  channel: LabelView;
  allyOrgName: string | null;
  amount: number | null;
  /** El usuario puede tomarlo (sin responsable y con permiso case.stage). */
  canTake: boolean;
}

export interface BandejaFilters {
  q: string;
  etapa: Stage | '';
  prioridad: Priority | '';
  producto: string;
  /** uuid de un usuario, 'none' (sin responsable) o ''. */
  responsable: string;
  entidad: string;
  canal: CaseChannel | '';
  vencidos: '1' | '';
}

export interface BandejaResponse {
  ok: true;
  scopeNote: string | null;
  filters: BandejaFilters;
  page: PageInfo;
  counts: { total: number; urgent: number; overdue: number };
  rows: CaseRow[];
  load: Array<{ assigneeId: string | null; name: string; open: number; overdue: number }>;
  options: {
    stages: OptionView[];
    priorities: OptionView[];
    products: OptionView[];
    channels: OptionView[];
    entities: OptionView[];
    staff: StaffOption[];
  };
  can: { assign: boolean; stage: boolean; create: boolean };
}

// ── Expediente del caso (360) ───────────────────────────────────────────

export interface ValuationView {
  value: number;
  low: number | null;
  high: number | null;
  confidence: LabelView;
  source: string;
  asOf: ISODate;
}

export interface PropertyView {
  id: string;
  alias: string;
  kind: string;
  address: string | null;
  city: string | null;
  stratum: number | null;
  areaM2: number | null;
  isVis: boolean;
  valuation: ValuationView | null;
}

export interface LoanView {
  id: string;
  alias: string;
  entityName: string | null;
  active: boolean;
  balance: number;
  balanceAsOf: ISODate;
  rateEa: number;
  system: LabelView;
  termMonths: number;
  paidInstallments: number;
  originalAmount: number;
  disbursedAt: ISODate;
  monthlyInsurance: number;
  confidence: LabelView;
  source: string;
}

export interface ConsentView {
  purpose: string;
  title: string;
  required: boolean;
  active: boolean;
  textVersion: string | null;
  grantedAt: ISODateTime | null;
  channel: string | null;
  capturedBy: string | null;
}

export interface ConsentHistoryRow {
  id: string;
  purpose: string;
  title: string;
  textVersion: string;
  textHashPrefix: string;
  channel: string;
  grantedAt: ISODateTime;
  capturedBy: string;
  revokedAt: ISODateTime | null;
  revokedBy: string | null;
}

export interface DocumentVersionView {
  id: string;
  version: number;
  status: LabelView;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: ISODateTime;
  expiresAt: ISODate | null;
  reviewer: string | null;
  reviewedAt: ISODateTime | null;
  rejectReason: string | null;
  /** Se puede pedir `GET empresa/documentos/{id}/enlace` (no está en cuarentena). */
  viewable: boolean;
}

export interface ChecklistItemView {
  type: { id: string; code: string; name: string; required: boolean; validityDays: number | null; description: string | null };
  /** Estado efectivo (APPROVED vencido → EXPIRED; sin carga → null). */
  status: LabelView | null;
  latest: DocumentVersionView | null;
  history: DocumentVersionView[];
  /** Hay versión pendiente de decisión (UPLOADED o IN_REVIEW). */
  pendingReview: boolean;
}

export interface InteractionView {
  id: string;
  channel: LabelView;
  summary: string;
  visibleToClient: boolean;
  by: string;
  createdAt: ISODateTime;
}

export interface TaskView {
  id: string;
  kind: LabelView;
  title: string;
  detail: string | null;
  assignee: UserRef;
  dueAt: ISODateTime;
  status: TaskStatus;
  overdue: boolean;
  doneAt: ISODateTime | null;
}

/** Resultados normalizados del motor financiero para una oferta. */
export interface OfferResultsView {
  payment: number;
  months: number;
  payoffDate: ISODate;
  totalInterest: number;
  totalInsurance: number;
  totalPaid: number;
  upfrontCosts: number;
  totalCost: number;
  costPerMillion: number;
  startDate: ISODate;
  uvr: { value: number; inflation: number; source: string } | null;
  portfolio: {
    loanId: string;
    loanAlias: string;
    basePayment: number;
    newPayment: number;
    monthlySavings: number;
    netSavings: number;
    breakEvenMonths: number | null;
    recommendation: string;
    recommendationText: string;
  } | null;
  assumptions: string[];
  warnings: string[];
  engineVersion: string;
}

export interface OfferView {
  id: string;
  entityName: string;
  rateEa: number;
  system: LabelView;
  termMonths: number;
  amount: number;
  monthlyInsurance: number;
  upfrontCosts: number;
  conditions: string | null;
  validUntil: ISODate | null;
  expired: boolean;
  source: string;
  engineVersion: string;
  createdAt: ISODateTime;
  results: OfferResultsView;
  /** Mejor cuota / menor costo total entre las ofertas del caso (solo si hay 2 o más). */
  bestPayment: boolean;
  bestTotalCost: boolean;
  accepted: { at: ISODateTime; by: string; channel: string | null; declaration: string | null } | null;
}

export interface CaseCommissionView {
  id: string;
  rule: { name: string; version: number };
  baseAmount: number;
  percent: number;
  gross: number;
  withholding: number;
  net: number;
  status: LabelView;
  causedAt: ISODateTime;
  expectedPayAt: ISODate;
  paymentRef: string | null;
  reverseReason: string | null;
}

export interface AuditEventView {
  /** Id del evento (bigint serializado como texto). */
  id: string;
  at: ISODateTime;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { id: string | null; name: string; email: string | null; role: string | null; roleLabel: string | null };
  channel: string;
  before: unknown;
  after: unknown;
  hashPrefix: string;
}

export interface StageChangeView {
  id: string;
  from: LabelView | null;
  to: LabelView;
  note: string | null;
  by: string;
  at: ISODateTime;
}

export interface CasoResponse {
  ok: true;
  case: {
    id: string;
    code: string;
    product: LabelView;
    channel: LabelView;
    stage: LabelView;
    stageAt: ISODateTime;
    priority: LabelView;
    sla: SlaView | null;
    escalatedAt: ISODateTime | null;
    closed: boolean;
    assignee: UserRef | null;
    entity: { id: string; name: string } | null;
    amount: number | null;
    disbursedAmount: number | null;
    ally: { user: { id: string; name: string; email: string } | null; org: { id: string; name: string; tier: string } | null };
    nextAction: string | null;
    withdrawReason: string | null;
    createdAt: ISODateTime;
  };
  client: {
    personId: string;
    name: string;
    firstName: string;
    lastName: string;
    documentType: LabelView;
    documentLast4: string;
    email: string | null;
    hasPhone: boolean;
    city: string | null;
    account: 'ACTIVE' | 'INACTIVE' | 'NONE';
    allyProtectionUntil: ISODateTime | null;
  };
  household: {
    monthlyIncome: number | null;
    monthlyExpenses: number | null;
    savings: number | null;
    monthlyMargin: number | null;
    goals: string | null;
    confidence: LabelView;
  };
  properties: PropertyView[];
  loans: LoanView[];
  consents: ConsentView[];
  revokedConsents: ConsentHistoryRow[];
  timeline: {
    pipeline: Array<{ stage: Stage; label: string; state: 'done' | 'now' | 'todo' }>;
    changes: StageChangeView[];
    allowedTransitions: OptionView[];
    /** Requisitos que valida el servidor para radicar (texto informativo). */
    filingRules: string;
  };
  checklist: { approved: number; total: number; items: ChecklistItemView[] };
  interactions: InteractionView[];
  tasks: TaskView[];
  offers: OfferView[];
  acceptedOfferId: string | null;
  commissions: CaseCommissionView[];
  commissionNote: string | null;
  auditLog: AuditEventView[];
  options: {
    staff: StaffOption[];
    entities: OptionView[];
    documentTypes: OptionView[];
    interactionChannels: OptionView[];
    taskKinds: OptionView[];
    priorities: OptionView[];
    offerSystems: OptionView[];
    acceptChannels: OptionView[];
  };
  can: {
    stage: boolean;
    assign: boolean;
    note: boolean;
    review: boolean;
    upload: boolean;
    offer: boolean;
    revealDocument: boolean;
    escalate: boolean;
    acceptOffer: boolean;
    createOffer: boolean;
  };
}

// ── Nuevo caso ──────────────────────────────────────────────────────────

export interface ConsentPurposeView {
  code: string;
  title: string;
  text: string;
  required: boolean;
}

export interface NuevoCasoResponse {
  ok: true;
  /** false si el rol no puede registrar personas (person.create). */
  allowed: boolean;
  /** El ASESOR queda como responsable: no se envía `assigneeId`. */
  lockAssigneeToSelf: boolean;
  consentVersion: string;
  declaration: string;
  options: {
    documentTypes: OptionView[];
    products: OptionView[];
    entities: OptionView[];
    staff: StaffOption[];
    captureChannels: OptionView[];
    consentPurposes: ConsentPurposeView[];
  };
}

// ── Leads ───────────────────────────────────────────────────────────────

export type LeadStatus = 'NEW' | 'CONVERTED' | 'DISCARDED';

export interface LeadRow {
  id: string;
  name: string;
  /** Sugerencia editable para el formulario de conversión. */
  suggested: { firstName: string; lastName: string; email: string | null; phone: string | null; city: string | null; captureChannel: 'TELEFONICO' };
  email: string | null;
  phone: string | null;
  city: string | null;
  message: string;
  source: string;
  status: LabelView;
  createdAt: ISODateTime;
  case: { id: string; code: string } | null;
  discardReason: string | null;
}

export interface LeadsResponse {
  ok: true;
  estado: LeadStatus;
  counts: Record<LeadStatus, number>;
  page: PageInfo;
  rows: LeadRow[];
  /** Mismo formulario que el alta de caso (catálogos). */
  form: NuevoCasoResponse['options'] & { lockAssigneeToSelf: boolean; declaration: string };
}

// ── Clientes ────────────────────────────────────────────────────────────

export interface ClienteRow {
  id: string;
  name: string;
  documentType: string;
  documentLast4: string;
  email: string | null;
  city: string | null;
  createdAt: ISODateTime;
  hasAccount: boolean;
  lastCase: { code: string; stage: LabelView } | null;
  counts: { cases: number; loans: number; requests: number };
}

export interface ClientesResponse {
  ok: true;
  /** 'doc' = búsqueda exacta por documento (índice ciego, sin descifrar). */
  mode: 'doc' | 'text' | 'all';
  filters: { q: string; tipo: string; doc: string };
  page: PageInfo;
  rows: ClienteRow[];
  documentTypes: OptionView[];
  can: { createCase: boolean };
}

export interface ClientDocumentRow {
  id: string;
  type: string;
  version: number;
  status: LabelView;
  createdAt: ISODateTime;
  expiresAt: ISODate | null;
  rejectReason: string | null;
  viewable: boolean;
}

export interface ClienteFichaResponse {
  ok: true;
  person: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    documentType: LabelView;
    documentLast4: string;
    email: string | null;
    hasPhone: boolean;
    city: string | null;
    createdAt: ISODateTime;
    account: { active: boolean; lastLoginAt: ISODateTime | null } | null;
    allyProtectionUntil: ISODateTime | null;
  };
  /** Sin autorización vigente de tratamiento: no contactar ni gestionar. */
  missingTreatmentConsent: boolean;
  household: { monthlyIncome: number | null; monthlyExpenses: number | null; savings: number | null; goals: string | null; confidence: LabelView };
  cases: Array<{
    id: string;
    code: string;
    createdAt: ISODateTime;
    product: LabelView;
    stage: LabelView;
    sla: SlaView | null;
    priority: LabelView;
    assignee: string | null;
    entity: string | null;
    channel: LabelView;
    allyOrgName: string | null;
    amount: number | null;
  }>;
  loans: LoanView[];
  properties: PropertyView[];
  documents: ClientDocumentRow[];
  requests: Array<{ id: string; code: string; subject: string; kind: LabelView; status: LabelView; createdAt: ISODateTime; slaDueAt: ISODateTime }>;
  consents: ConsentView[];
  consentHistory: ConsentHistoryRow[];
  revokeChannels: OptionView[];
  can: { revokeConsent: boolean; createCase: boolean; openRequests: boolean };
}

// ── Documentos (cola de revisión) ───────────────────────────────────────

export interface DocQueueRow {
  id: string;
  type: { name: string; validityDays: number | null };
  version: number;
  createdAt: ISODateTime;
  waitingHours: number;
  person: { id: string; name: string };
  case: { id: string; code: string } | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  scanResult: string;
  status: LabelView;
  reviewer: UserRef | null;
  reviewerIsMe: boolean;
  /** Botón "Tomar": cargado, o en revisión por otra persona. */
  canTake: boolean;
}

export interface DocumentosResponse {
  ok: true;
  filters: { estado: 'UPLOADED' | 'IN_REVIEW' | ''; tipo: string; mios: '1' | '' };
  counts: { uploaded: number; inReview: number; quarantined: number };
  page: PageInfo;
  rows: DocQueueRow[];
  quarantined: Array<{ id: string; type: string; person: { id: string; name: string }; createdAt: ISODateTime; scanResult: string }>;
  types: OptionView[];
}

// ── Pagos ───────────────────────────────────────────────────────────────

export type PagosTab = 'cola' | 'conciliar' | 'historico';

export interface PaymentRow {
  id: string;
  kind: LabelView;
  amount: number;
  status: LabelView;
  paidOn: ISODate;
  createdAt: ISODateTime;
  channel: string;
  reference: string | null;
  client: { personId: string; name: string; documentLast4: string };
  loan: { id: string; alias: string; entityName: string | null; balance: number };
  support: { documentId: string; fileName: string; status: LabelView; viewable: boolean } | null;
  reviewer: { name: string; at: ISODateTime | null } | null;
  rejectReason: string | null;
  reconciled: { at: ISODateTime | null; reference: string | null } | null;
  /** Otros reportes con el mismo soporte o mismo crédito, fecha y valor. */
  possibleDuplicates: Array<{ id: string; status: LabelView }>;
  can: { take: boolean; validate: boolean; reject: boolean; reconcile: boolean };
}

export interface PagosResponse {
  ok: true;
  tab: PagosTab;
  counts: { cola: number; conciliar: number; byStatus: Record<PaymentStatus, number> };
  page: PageInfo;
  rows: PaymentRow[];
  notice: string;
}

// ── Solicitudes ─────────────────────────────────────────────────────────

export interface RequestRow {
  id: string;
  code: string;
  subject: string;
  kind: LabelView;
  status: LabelView;
  client: { id: string; name: string };
  messages: number;
  assignee: UserRef | null;
  sla: SlaView;
  closed: boolean;
  closedAt: ISODateTime | null;
}

export interface SolicitudesResponse {
  ok: true;
  filters: { estado: RequestStatus | ''; tipo: string; resp: string; vencidas: '1' | '' };
  counts: { open: number; overdue: number };
  page: PageInfo;
  rows: RequestRow[];
  options: { statuses: OptionView[]; kinds: OptionView[]; staff: StaffOption[] };
}

export interface RequestMessageView {
  id: string;
  body: string;
  internal: boolean;
  fromClient: boolean;
  author: { name: string; roleLabel: string | null };
  createdAt: ISODateTime;
}

export interface SolicitudResponse {
  ok: true;
  request: {
    id: string;
    code: string;
    subject: string;
    detail: string;
    kind: LabelView;
    status: LabelView;
    closed: boolean;
    resolution: string | null;
    createdAt: ISODateTime;
    sla: SlaView;
    assignee: UserRef | null;
    assignedToMe: boolean;
  };
  client: { id: string; name: string; email: string | null; hasAccount: boolean };
  messages: RequestMessageView[];
  scenario: {
    id: string;
    name: string;
    kind: string;
    createdAt: ISODateTime;
    engineVersion: string;
    inputsHashPrefix: string;
    results: unknown;
    assumptions: unknown;
  } | null;
  options: { staff: StaffOption[]; statuses: OptionView[]; outcomes: OptionView[] };
}

// ── Aliados ─────────────────────────────────────────────────────────────

export interface AllyStatsView {
  cases: number;
  disbursed: number;
  withdrawn: number;
  disbursedSum: number;
  monthSum: number;
  docsFirstApproved: number;
  docsReviewed: number;
  conversion: number | null;
  withdrawalRate: number | null;
  docQuality: number | null;
  /** Puntaje responsable 0–100 (null sin datos). */
  score: number | null;
}

export interface AllyOrgRow {
  id: string;
  /** Posición en el ranking (null = muestra pequeña, sin posición). */
  rank: number | null;
  name: string;
  kind: LabelView;
  territory: string | null;
  tier: string;
  active: boolean;
  users: { active: number; total: number };
  monthlyGoal: number | null;
  goalRatio: number | null;
  stats: AllyStatsView;
  smallSample: boolean;
}

export interface AliadosResponse {
  ok: true;
  rows: AllyOrgRow[];
  minCasesForRanking: number;
  scoreDefinition: string;
  kinds: OptionView[];
  tiers: string[];
}

export interface AllyUserRow {
  id: string;
  name: string;
  email: string;
  role: LabelView;
  active: boolean;
  state: LabelView;
  invitation: { expiresAt: ISODateTime; expired: boolean } | null;
  lastLoginAt: ISODateTime | null;
  /** Curso crítico vencido o pendiente: bloquea radicar. */
  blocked: boolean;
  certifications: Array<{ courseId: string; state: LabelView; ok: boolean }>;
  can: { resendInvite: boolean; deactivate: boolean; reactivate: boolean };
}

export interface AliadoResponse {
  ok: true;
  org: {
    id: string;
    name: string;
    kind: LabelView;
    taxId: string | null;
    territory: string | null;
    tier: string;
    active: boolean;
    monthlyGoal: number | null;
    createdAt: ISODateTime;
  };
  stats: AllyStatsView;
  goalRatio: number | null;
  courses: Array<{ id: string; title: string; critical: boolean; mandatory: boolean }>;
  users: AllyUserRow[];
  recentCases: Array<{ id: string; code: string; clientName: string; product: LabelView; stage: LabelView; allyUserName: string | null; updatedAt: ISODateTime }>;
  options: { kinds: OptionView[]; roles: OptionView[]; tiers: string[] };
}

// ── Comisiones ──────────────────────────────────────────────────────────

export type ComisionesTab = 'liquidacion' | 'resumen' | 'reglas';

export interface CommissionRow {
  id: string;
  case: { id: string; code: string; clientName: string; product: LabelView; entityName: string | null };
  allyOrg: { id: string; name: string };
  allyUserName: string | null;
  baseAmount: number;
  percent: number;
  gross: number;
  withholding: number;
  net: number;
  rule: { name: string; version: number };
  status: LabelView;
  causedAt: ISODateTime;
  approvedAt: ISODateTime | null;
  expectedPayAt: ISODate;
  paidAt: ISODateTime | null;
  paymentRef: string | null;
  reversedAt: ISODateTime | null;
  reverseReason: string | null;
  can: { approve: boolean; schedule: boolean; pay: boolean; reverse: boolean };
}

export interface CommissionRuleRow {
  id: string;
  name: string;
  version: number;
  isLatest: boolean;
  scope: string;
  organization: { id: string; name: string } | null;
  tier: string | null;
  product: LabelView | null;
  basis: string;
  percent: number;
  withholdingPct: number;
  paymentDays: number;
  validFrom: ISODate;
  validTo: ISODate | null;
  active: boolean;
  inForce: boolean;
  uses: number;
  can: { version: boolean; close: boolean };
}

export interface ComisionesResponse {
  ok: true;
  tab: ComisionesTab;
  orgs: Array<{ id: string; name: string; tier: string; active: boolean }>;
  statuses: OptionView[];
  can: { pay: boolean; rules: boolean };
  /** tab=liquidacion */
  liquidacion?: {
    filters: { estado: CommissionStatus | ''; aliado: string; desde: string; hasta: string };
    page: PageInfo;
    totals: { count: number; gross: number; withholding: number; net: number };
    rows: CommissionRow[];
  };
  /** tab=resumen */
  resumen?: {
    filters: { desde: ISODate; hasta: ISODate; estado: CommissionStatus | '' };
    rows: Array<{ orgId: string; orgName: string; totalNet: number; byStatus: Record<CommissionStatus, { net: number; gross: number; count: number } | null> }>;
    /** Ruta del CSV de cierre (acepta el mismo Bearer). */
    csvPath: string;
  };
  /** tab=reglas */
  reglas?: {
    rows: CommissionRuleRow[];
    products: OptionView[];
    priorityNote: string;
  };
}

// ── Analítica ───────────────────────────────────────────────────────────

export interface ConversionRowView {
  key: string | null;
  label: string;
  total: number;
  filed: number;
  disbursed: number;
  createdToDisbursed: number | null;
  filedToDisbursed: number | null;
  disbursedAmount: number;
}

export interface AnaliticaResponse {
  ok: true;
  range: { desde: ISODate; hasta: ISODate; timezone: 'America/Bogota' };
  north: {
    windowDays: number;
    windowEnd: ISODate;
    ratio: number | null;
    numerator: number;
    denominator: number;
    byKind: Array<{ kind: string; label: string; households: number }>;
    /** Definición textual de la métrica norte (hogar, activo, acciones que cuentan). */
    definition: { household: string; active: string; actions: string; rule: string };
  };
  kpis: {
    created: number;
    withdrawn: number;
    disbursed: number;
    disbursedAmount: number;
    filed: number;
    filedToDisbursed: number | null;
    createdToDisbursed: number | null;
    slaClosed: number;
    slaWithin: number;
    slaRatio: number | null;
    overdueOpenToday: number;
  };
  funnel: Array<{ stage: Stage; label: string; reached: number }>;
  withdrawalReasons: Array<{ reason: string | null; count: number }>;
  stageTimes: Array<{ stage: Stage; label: string; closed: number; avgHours: number; medianHours: number; slaHours: number | null; withinSlaRatio: number | null; overdueOpen: number }>;
  conversion: { byChannel: ConversionRowView[]; byAlly: ConversionRowView[]; byEntity: ConversionRowView[] };
  documents: { reviewed: number; rejected: number; approved: number; rejectRatio: number | null; approvedFirstRatio: number | null; topRejectedTypes: Array<{ name: string; count: number }> };
  payments: { total: number; byStatus: Array<{ status: LabelView; count: number }>; reconciledRatio: number | null; avgReviewHours: number | null };
  requests: { resolved: number; withinSla: number; withinSlaRatio: number | null; overdueOpenToday: number; resolvedByKind: Array<{ kind: LabelView; count: number }>; note: string };
}

// ── Auditoría ───────────────────────────────────────────────────────────

export interface AuditoriaResponse {
  ok: true;
  filters: { accion: string; entidad: string; id: string; actor: string; desde: string; hasta: string };
  /** Paginación por cursor: pasar `?antes=` (más antiguos) o `?despues=` (más recientes). */
  cursor: { antes: string | null; despues: string | null; hasOlder: boolean; hasNewer: boolean };
  pageSize: number;
  rows: AuditEventView[];
  entities: string[];
  /** Ruta del CSV (acepta el mismo Bearer). */
  csvPath: string;
}

// ── Catálogos ───────────────────────────────────────────────────────────

export interface CatalogosResponse {
  ok: true;
  entities: Array<{ id: string; name: string; active: boolean; agreement: boolean; slaHours: number; notes: string | null; cases: number; loans: number; updatedAt: ISODateTime }>;
  rates: Array<{ id: string; entity: { id: string; name: string } | null; product: LabelView; system: LabelView; rateEa: number; asOf: ISODate; validUntil: ISODate | null; expired: boolean; source: string }>;
  parameters: Array<{ key: string; latest: number; unit: 'fraction' | 'number'; history: Array<{ id: string; value: number; asOf: ISODate; source: string; createdAt: ISODateTime }> }>;
  documentTypes: Array<{ id: string; code: string; name: string; description: string | null; validityDays: number | null; products: string[]; required: boolean; active: boolean; sortOrder: number; documents: number }>;
  courses: Array<{ id: string; slug: string; title: string; summary: string; active: boolean; critical: boolean; mandatory: boolean; validityDays: number; passScore: number; version: number; enrollments: number; certifications: number; content: { lessons: unknown; quiz: unknown } }>;
  options: { products: OptionView[]; docProducts: OptionView[]; systems: OptionView[]; parameterKeys: string[] };
  today: ISODate;
}

// ── Usuarios ────────────────────────────────────────────────────────────

export interface UserSessionView {
  id: string;
  device: string;
  current: boolean;
  mfaPassed: boolean;
  createdAt: ISODateTime;
  lastSeenAt: ISODateTime;
  expiresAt: ISODateTime;
}

export interface StaffUserRow {
  id: string;
  name: string;
  email: string;
  role: LabelView;
  active: boolean;
  pendingInvitation: boolean;
  mfaEnabled: boolean;
  mfaSince: ISODateTime | null;
  self: boolean;
  lastLoginAt: ISODateTime | null;
  createdAt: ISODateTime;
  sessions: UserSessionView[];
  can: { changeRole: boolean; deactivate: boolean; reactivate: boolean; resendInvite: boolean; resetMfa: boolean };
}

export interface UsuariosResponse {
  ok: true;
  filters: { q: string; rol: StaffRole | ''; estado: 'activos' | 'inactivos' | 'pendientes' | 'sin-mfa' | '' };
  activeAdmins: number;
  page: PageInfo;
  rows: StaffUserRow[];
  roles: OptionView[];
}
