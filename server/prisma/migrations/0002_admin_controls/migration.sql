ALTER TYPE "RedemptionStatus" ADD VALUE 'APPROVED';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'COLLECTOR_PROBLEM';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'COLLECTION_PROBLEM';

ALTER TABLE "Facility"
ADD COLUMN "isSuspended" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Report"
ADD COLUMN "suggestedAcceptedMaterials" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_entityType_entityId_createdAt_idx"
ON "AdminAuditLog"("entityType", "entityId", "createdAt");

CREATE INDEX "AdminAuditLog_adminId_createdAt_idx"
ON "AdminAuditLog"("adminId", "createdAt");

ALTER TABLE "AdminAuditLog"
ADD CONSTRAINT "AdminAuditLog_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;