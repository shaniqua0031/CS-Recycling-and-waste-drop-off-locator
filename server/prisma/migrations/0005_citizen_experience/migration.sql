ALTER TYPE "CollectionStatus" ADD VALUE 'COLLECTING';
ALTER TYPE "CollectionStatus" ADD VALUE 'PAUSED';

ALTER TYPE "NotificationType" ADD VALUE 'COLLECTION_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'COLLECTION_PAUSED';
ALTER TYPE "NotificationType" ADD VALUE 'COLLECTION_RESUMED';

ALTER TYPE "ReportType" ADD VALUE 'OVERFLOWING_BIN';
ALTER TYPE "ReportType" ADD VALUE 'OVERFLOWING_DROP_OFF';
ALTER TYPE "ReportType" ADD VALUE 'FACILITY_FULL';
ALTER TYPE "ReportType" ADD VALUE 'FACILITY_CLOSED';
ALTER TYPE "ReportType" ADD VALUE 'INCORRECT_OPENING_HOURS';
ALTER TYPE "ReportType" ADD VALUE 'ILLEGAL_DUMPING';
ALTER TYPE "ReportType" ADD VALUE 'BROKEN_GLASS';
ALTER TYPE "ReportType" ADD VALUE 'HAZARDOUS_WASTE';

CREATE TYPE "IncidentPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "BufferedEventStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACTIVATED');

ALTER TABLE "RecyclerProfile"
  ADD COLUMN "collectionAddress" TEXT,
  ADD COLUMN "collectionLatitude" DOUBLE PRECISION,
  ADD COLUMN "collectionLongitude" DOUBLE PRECISION;

ALTER TABLE "CollectionRequest"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "bufferedEventId" TEXT;

ALTER TABLE "Report"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "incidentId" TEXT;

ALTER TABLE "RewardRedemption"
  ADD COLUMN "rewardId" TEXT,
  ADD COLUMN "rewardName" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE TABLE "RewardCatalogItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "pointsCost" INTEGER NOT NULL,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "RewardCatalogItem_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RewardCatalogItem" ("id", "name", "description", "pointsCost") VALUES
  ('recycling-bag', 'Reusable recycling bag', 'A reusable bag for sorting recyclable materials.', 75),
  ('garden-seeds', 'Community garden seed pack', 'A seed pack for a local community garden.', 150),
  ('transport-voucher', 'Local transport voucher', 'A prototype local transport reward, subject to manual review.', 300);

CREATE INDEX "RewardCatalogItem_isAvailable_pointsCost_idx" ON "RewardCatalogItem"("isAvailable", "pointsCost");
ALTER TABLE "RewardRedemption"
  ADD CONSTRAINT "RewardRedemption_rewardId_fkey"
  FOREIGN KEY ("rewardId") REFERENCES "RewardCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Incident" (
  "id" TEXT NOT NULL,
  "type" "ReportType" NOT NULL,
  "priority" "IncidentPriority" NOT NULL DEFAULT 'LOW',
  "facilityId" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "reportCount" INTEGER NOT NULL DEFAULT 0,
  "communityVerified" BOOLEAN NOT NULL DEFAULT false,
  "firstReportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BufferedCollectionEvent" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "destinationFacilityId" TEXT,
  "estimatedKg" DECIMAL(8,2) NOT NULL,
  "requestedFor" TIMESTAMP(3) NOT NULL,
  "pickupAddress" TEXT NOT NULL,
  "pickupLatitude" DOUBLE PRECISION NOT NULL,
  "pickupLongitude" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "status" "BufferedEventStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "IncidentPriority" NOT NULL DEFAULT 'LOW',
  "activateAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BufferedCollectionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionRequest_bufferedEventId_key" ON "CollectionRequest"("bufferedEventId");
CREATE UNIQUE INDEX "BufferedCollectionEvent_idempotencyKey_key" ON "BufferedCollectionEvent"("idempotencyKey");
CREATE INDEX "Incident_type_facilityId_lastReportedAt_idx" ON "Incident"("type", "facilityId", "lastReportedAt");
CREATE INDEX "Incident_priority_resolvedAt_idx" ON "Incident"("priority", "resolvedAt");
CREATE INDEX "BufferedCollectionEvent_status_activateAt_idx" ON "BufferedCollectionEvent"("status", "activateAt");
CREATE INDEX "BufferedCollectionEvent_requesterId_createdAt_idx" ON "BufferedCollectionEvent"("requesterId", "createdAt");

ALTER TABLE "CollectionRequest"
  ADD CONSTRAINT "CollectionRequest_bufferedEventId_fkey"
  FOREIGN KEY ("bufferedEventId") REFERENCES "BufferedCollectionEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_facilityId_fkey"
  FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BufferedCollectionEvent"
  ADD CONSTRAINT "BufferedCollectionEvent_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BufferedCollectionEvent_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BufferedCollectionEvent_destinationFacilityId_fkey"
  FOREIGN KEY ("destinationFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
