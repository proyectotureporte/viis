-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'ALLY', 'ALLY_ADMIN', 'ADVISOR', 'DOC_ANALYST', 'FIN_ANALYST', 'COORDINATOR', 'POSTSALE', 'TREASURY', 'COMPLIANCE', 'ADMIN', 'DIRECTOR');

-- CreateEnum
CREATE TYPE "OrgKind" AS ENUM ('OPENV', 'ALLY_PERSON', 'ALLY_COMPANY');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'INVITE', 'EMAIL_OTP');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('CONFIRMED', 'ESTIMATED', 'DECLARED');

-- CreateEnum
CREATE TYPE "AmortSystem" AS ENUM ('FIXED_PESOS', 'UVR');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('LEAD', 'CONTACTED', 'PROFILED', 'DOCUMENTING', 'FILED', 'APPROVED', 'SIGNED', 'DISBURSED', 'WITHDRAWN', 'POSTSALE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REPORTED', 'IN_REVIEW', 'VALIDATED', 'REJECTED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CLIENT', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('CAUSED', 'APPROVED', 'SCHEDULED', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "contact_requests" ADD COLUMN     "opportunityId" UUID;

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "kind" "OrgKind" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "taxId" VARCHAR(40),
    "territory" VARCHAR(160),
    "tier" VARCHAR(24) NOT NULL DEFAULT 'BASE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monthlyGoal" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "role" "Role" NOT NULL,
    "organizationId" UUID,
    "passwordHash" VARCHAR(255),
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMPTZ(3),
    "totpLastCounter" INTEGER,
    "recoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "passwordChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "mfaPassed" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" VARCHAR(400),
    "ipHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" BIGSERIAL NOT NULL,
    "key" CHAR(64) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "documentType" VARCHAR(8) NOT NULL,
    "documentNumEnc" TEXT NOT NULL,
    "documentIndex" CHAR(64) NOT NULL,
    "documentLast4" VARCHAR(4) NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "phoneEnc" TEXT,
    "city" VARCHAR(120),
    "monthlyIncome" BIGINT,
    "monthlyExpenses" BIGINT,
    "savings" BIGINT,
    "goals" TEXT,
    "ownerAllyOrgId" UUID,
    "ownerUntil" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "textVersion" VARCHAR(20) NOT NULL,
    "textHash" CHAR(64) NOT NULL,
    "channel" VARCHAR(40) NOT NULL,
    "capturedBy" UUID,
    "ipHash" CHAR(64),
    "userAgent" VARCHAR(400),
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedBy" UUID,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "alias" VARCHAR(80) NOT NULL,
    "address" VARCHAR(240),
    "city" VARCHAR(120),
    "kind" VARCHAR(24) NOT NULL DEFAULT 'APARTAMENTO',
    "stratum" INTEGER,
    "areaM2" DECIMAL(10,2),
    "isVis" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_valuations" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "value" BIGINT NOT NULL,
    "low" BIGINT,
    "high" BIGINT,
    "confidence" "Confidence" NOT NULL,
    "source" VARCHAR(160) NOT NULL,
    "methodology" TEXT,
    "asOf" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "agreement" BOOLEAN NOT NULL DEFAULT false,
    "slaHours" INTEGER NOT NULL DEFAULT 72,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_rates" (
    "id" UUID NOT NULL,
    "entityId" UUID,
    "product" VARCHAR(40) NOT NULL,
    "system" VARCHAR(12) NOT NULL,
    "rateEa" DECIMAL(8,6) NOT NULL,
    "source" VARCHAR(200) NOT NULL,
    "asOf" DATE NOT NULL,
    "validUntil" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_parameters" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "value" DECIMAL(20,8) NOT NULL,
    "source" VARCHAR(200) NOT NULL,
    "asOf" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "propertyId" UUID,
    "entityId" UUID,
    "alias" VARCHAR(80) NOT NULL,
    "system" "AmortSystem" NOT NULL DEFAULT 'FIXED_PESOS',
    "rateEa" DECIMAL(8,6) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "originalAmount" BIGINT NOT NULL,
    "disbursedAt" DATE NOT NULL,
    "balance" BIGINT NOT NULL,
    "balanceAsOf" DATE NOT NULL,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "monthlyInsurance" BIGINT NOT NULL DEFAULT 0,
    "paymentDay" INTEGER NOT NULL DEFAULT 5,
    "confidence" "Confidence" NOT NULL DEFAULT 'DECLARED',
    "source" VARCHAR(200) NOT NULL DEFAULT 'Declarado por el cliente',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_snapshots" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "reason" VARCHAR(160) NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "personId" UUID NOT NULL,
    "product" VARCHAR(32) NOT NULL,
    "stage" "Stage" NOT NULL DEFAULT 'LEAD',
    "stageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "amount" BIGINT,
    "disbursedAmount" BIGINT,
    "entityId" UUID,
    "channel" VARCHAR(24) NOT NULL DEFAULT 'DIRECTO',
    "allyOrgId" UUID,
    "allyUserId" UUID,
    "assigneeId" UUID,
    "slaDueAt" TIMESTAMPTZ(3),
    "escalatedAt" TIMESTAMPTZ(3),
    "withdrawReason" VARCHAR(240),
    "nextAction" VARCHAR(240),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_changes" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "from" "Stage",
    "to" "Stage" NOT NULL,
    "note" VARCHAR(500),
    "byUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "opportunityId" UUID,
    "assigneeId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'TAREA',
    "title" VARCHAR(200) NOT NULL,
    "detail" TEXT,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "channel" VARCHAR(24) NOT NULL,
    "summary" TEXT NOT NULL,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT false,
    "byUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "entityName" VARCHAR(120) NOT NULL,
    "rateEa" DECIMAL(8,6) NOT NULL,
    "system" "AmortSystem" NOT NULL DEFAULT 'FIXED_PESOS',
    "termMonths" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "monthlyInsurance" BIGINT NOT NULL DEFAULT 0,
    "upfrontCosts" BIGINT NOT NULL DEFAULT 0,
    "conditions" TEXT,
    "validUntil" DATE,
    "source" VARCHAR(200) NOT NULL,
    "results" JSONB NOT NULL,
    "engineVersion" VARCHAR(16) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedById" UUID,
    "acceptEvidence" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "validityDays" INTEGER,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "opportunityId" UUID,
    "typeId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DocStatus" NOT NULL DEFAULT 'UPLOADED',
    "fileName" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(80) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageKey" VARCHAR(120) NOT NULL,
    "scanResult" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "rejectReason" VARCHAR(500),
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "expiresAt" DATE,
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reports" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "applyMode" VARCHAR(16),
    "paidOn" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "channel" VARCHAR(60) NOT NULL,
    "reference" VARCHAR(80),
    "documentId" UUID,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REPORTED',
    "rejectReason" VARCHAR(500),
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reportedById" UUID NOT NULL,
    "dedupeKey" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "loanId" UUID,
    "kind" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "inputs" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "engineVersion" VARCHAR(16) NOT NULL,
    "inputsHash" CHAR(64) NOT NULL,
    "sharedWithAdvisor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "personId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "detail" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" UUID,
    "slaDueAt" TIMESTAMPTZ(3) NOT NULL,
    "resolution" TEXT,
    "scenarioId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_messages" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "byUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "organizationId" UUID,
    "tier" VARCHAR(24),
    "product" VARCHAR(32),
    "basis" VARCHAR(16) NOT NULL DEFAULT 'DISBURSED',
    "percent" DECIMAL(7,4) NOT NULL,
    "withholdingPct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "paymentDays" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "allyUserId" UUID,
    "allyOrgId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "ruleSnapshot" JSONB NOT NULL,
    "baseAmount" BIGINT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "gross" BIGINT NOT NULL,
    "withholding" BIGINT NOT NULL,
    "net" BIGINT NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'CAUSED',
    "causedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "expectedPayAt" DATE NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "paymentRef" VARCHAR(120),
    "reversedAt" TIMESTAMPTZ(3),
    "reverseReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "passScore" INTEGER NOT NULL DEFAULT 80,
    "lessons" JSONB NOT NULL,
    "quiz" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "lessonsDone" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "courseVersion" INTEGER NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "code" VARCHAR(24) NOT NULL,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "href" VARCHAR(300),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" VARCHAR(1000),
    "lockedAt" TIMESTAMPTZ(3),
    "doneAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "actorRole" VARCHAR(20),
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'web',
    "ipHash" CHAR(64),
    "prevHash" CHAR(64) NOT NULL,
    "hash" CHAR(64) NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "key" VARCHAR(20) NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_active_idx" ON "users"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_purpose_idx" ON "auth_tokens"("userId", "purpose");

-- CreateIndex
CREATE INDEX "login_attempts_key_createdAt_idx" ON "login_attempts"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "persons_userId_key" ON "persons"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "persons_documentIndex_key" ON "persons"("documentIndex");

-- CreateIndex
CREATE INDEX "persons_email_idx" ON "persons"("email");

-- CreateIndex
CREATE INDEX "consents_personId_purpose_idx" ON "consents"("personId", "purpose");

-- CreateIndex
CREATE INDEX "property_valuations_propertyId_asOf_idx" ON "property_valuations"("propertyId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "entities_name_key" ON "entities"("name");

-- CreateIndex
CREATE INDEX "reference_rates_product_asOf_idx" ON "reference_rates"("product", "asOf");

-- CreateIndex
CREATE INDEX "financial_parameters_key_asOf_idx" ON "financial_parameters"("key", "asOf");

-- CreateIndex
CREATE INDEX "loans_personId_active_idx" ON "loans"("personId", "active");

-- CreateIndex
CREATE INDEX "loan_snapshots_loanId_createdAt_idx" ON "loan_snapshots"("loanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_code_key" ON "opportunities"("code");

-- CreateIndex
CREATE INDEX "opportunities_stage_slaDueAt_idx" ON "opportunities"("stage", "slaDueAt");

-- CreateIndex
CREATE INDEX "opportunities_allyOrgId_stage_idx" ON "opportunities"("allyOrgId", "stage");

-- CreateIndex
CREATE INDEX "opportunities_assigneeId_stage_idx" ON "opportunities"("assigneeId", "stage");

-- CreateIndex
CREATE INDEX "stage_changes_opportunityId_createdAt_idx" ON "stage_changes"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_status_dueAt_idx" ON "tasks"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "interactions_opportunityId_createdAt_idx" ON "interactions"("opportunityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storageKey_key" ON "documents"("storageKey");

-- CreateIndex
CREATE INDEX "documents_personId_typeId_version_idx" ON "documents"("personId", "typeId", "version");

-- CreateIndex
CREATE INDEX "documents_opportunityId_status_idx" ON "documents"("opportunityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reports_documentId_key" ON "payment_reports"("documentId");

-- CreateIndex
CREATE INDEX "payment_reports_loanId_paidOn_idx" ON "payment_reports"("loanId", "paidOn");

-- CreateIndex
CREATE INDEX "payment_reports_status_createdAt_idx" ON "payment_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payment_reports_dedupeKey_idx" ON "payment_reports"("dedupeKey");

-- CreateIndex
CREATE INDEX "scenarios_userId_createdAt_idx" ON "scenarios"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_code_key" ON "service_requests"("code");

-- CreateIndex
CREATE INDEX "service_requests_status_slaDueAt_idx" ON "service_requests"("status", "slaDueAt");

-- CreateIndex
CREATE INDEX "request_messages_requestId_createdAt_idx" ON "request_messages"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "commission_rules_active_validFrom_idx" ON "commission_rules"("active", "validFrom");

-- CreateIndex
CREATE INDEX "commissions_allyOrgId_status_idx" ON "commissions"("allyOrgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_opportunityId_allyOrgId_key" ON "commissions"("opportunityId", "allyOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "certifications_code_key" ON "certifications"("code");

-- CreateIndex
CREATE INDEX "certifications_userId_courseId_expiresAt_idx" ON "certifications"("userId", "courseId", "expiresAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_status_runAfter_idx" ON "jobs"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_hash_key" ON "audit_events"("hash");

-- CreateIndex
CREATE INDEX "audit_events_entity_entityId_idx" ON "audit_events"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_actorId_at_idx" ON "audit_events"("actorId", "at");

-- CreateIndex
CREATE INDEX "audit_events_action_at_idx" ON "audit_events"("action", "at");

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_valuations" ADD CONSTRAINT "property_valuations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_rates" ADD CONSTRAINT "reference_rates_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_snapshots" ADD CONSTRAINT "loan_snapshots_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_allyOrgId_fkey" FOREIGN KEY ("allyOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_allyUserId_fkey" FOREIGN KEY ("allyUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_changes" ADD CONSTRAINT "stage_changes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reports" ADD CONSTRAINT "payment_reports_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reports" ADD CONSTRAINT "payment_reports_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_allyUserId_fkey" FOREIGN KEY ("allyUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "commission_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────────────────────────────────────────────────────────────────────────
-- Bitácora inmutable: la base de datos rechaza cualquier UPDATE, DELETE o
-- TRUNCATE sobre audit_events, sin importar desde dónde se intente.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_events_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events es de solo inserción (%).', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_inmutable();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_inmutable();
