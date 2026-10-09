ALTER TYPE "NotificationType" ADD VALUE 'COLLECTION_PRIORITY_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'COLLECTION_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'COLLECTION_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'FACILITY_ISSUE';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MESSAGE';

ALTER TABLE "CollectorProfile"
ADD COLUMN "qualifiedMaterialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "CollectionRequest"
ADD COLUMN "priority" "IncidentPriority" NOT NULL DEFAULT 'MEDIUM';

ALTER TABLE "CollectionAssignment"
ALTER COLUMN "assignedByUserId" DROP NOT NULL,
ADD COLUMN "declineReasonCode" TEXT;

ALTER TABLE "CollectionWeight"
ADD COLUMN "notes" TEXT;

CREATE TABLE "CollectionMaterialWeight" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "actualKg" DECIMAL(8,2) NOT NULL,
  "verifiedKg" DECIMAL(8,2),
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "CollectionMaterialWeight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionMaterialWeight_requestId_materialId_key"
ON "CollectionMaterialWeight"("requestId", "materialId");

CREATE INDEX "CollectionMaterialWeight_materialId_recordedAt_idx"
ON "CollectionMaterialWeight"("materialId", "recordedAt");

ALTER TABLE "CollectionMaterialWeight"
ADD CONSTRAINT "CollectionMaterialWeight_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "CollectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionMaterialWeight"
ADD CONSTRAINT "CollectionMaterialWeight_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;