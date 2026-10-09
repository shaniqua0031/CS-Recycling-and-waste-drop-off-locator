CREATE TYPE "FacilityOperationalStatus" AS ENUM ('OPEN', 'CLOSED', 'TEMPORARILY_CLOSED', 'NEAR_CAPACITY', 'FULL');

ALTER TYPE "NotificationType" ADD VALUE 'CAPACITY_WARNING';
ALTER TYPE "NotificationType" ADD VALUE 'FACILITY_FULL';

ALTER TYPE "ReportType" ADD VALUE 'EQUIPMENT_ISSUE';
ALTER TYPE "ReportType" ADD VALUE 'CAPACITY_PROBLEM';
ALTER TYPE "ReportType" ADD VALUE 'SAFETY_ISSUE';
ALTER TYPE "ReportType" ADD VALUE 'INCORRECT_MATERIAL';

ALTER TABLE "Facility"
ADD COLUMN "description" TEXT,
ADD COLUMN "operationalStatus" "FacilityOperationalStatus" NOT NULL DEFAULT 'OPEN';

ALTER TABLE "FacilityMaterial"
ADD COLUMN "capacityKg" DECIMAL(10,2),
ADD COLUMN "currentKg" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "CollectionWeight"
ADD COLUMN "facilityReceivedKg" DECIMAL(8,2),
ADD COLUMN "receivedByUserId" TEXT,
ADD COLUMN "receivedAt" TIMESTAMP(3),
ADD COLUMN "facilityCondition" TEXT,
ADD COLUMN "facilityNotes" TEXT;

ALTER TABLE "CollectionWeight"
ADD CONSTRAINT "CollectionWeight_receivedByUserId_fkey"
FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Incident"
ADD COLUMN "materialId" TEXT,
ADD COLUMN "details" TEXT,
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Incident_dedupeKey_key" ON "Incident"("dedupeKey");

ALTER TABLE "Incident"
ADD CONSTRAINT "Incident_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD COLUMN "facilityId" TEXT;

CREATE INDEX "Notification_facilityId_createdAt_idx" ON "Notification"("facilityId", "createdAt");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;