CREATE TABLE "contact_requests" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(30),
    "city" VARCHAR(120),
    "message" TEXT NOT NULL,
    "source" VARCHAR(120) NOT NULL DEFAULT 'web',
    "status" VARCHAR(24) NOT NULL DEFAULT 'NEW',
    "ipHash" CHAR(64),
    "notificationStatus" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "notificationMessageId" VARCHAR(120),
    "notificationError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_requests_status_createdAt_idx"
    ON "contact_requests"("status", "createdAt");

CREATE INDEX "contact_requests_ipHash_createdAt_idx"
    ON "contact_requests"("ipHash", "createdAt");
