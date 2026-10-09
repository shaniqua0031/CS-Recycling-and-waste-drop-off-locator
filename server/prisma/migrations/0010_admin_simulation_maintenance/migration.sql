ALTER TYPE "CollectionStatus" ADD VALUE 'SCHEDULED_MAINTENANCE' AFTER 'WAITING_FOR_ADMIN';

CREATE TABLE "FacilityMaintenanceWindow" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 15,
  "overrunEnabled" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilityMaintenanceWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FacilitySensorEvent" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reading" DOUBLE PRECISION NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resetAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitySensorEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminSimulatorEvent" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "resetAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSimulatorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacilityMaintenanceWindow_facilityId_status_startsAt_endsAt_idx" ON "FacilityMaintenanceWindow"("facilityId", "status", "startsAt", "endsAt");
CREATE INDEX "FacilitySensorEvent_facilityId_expiresAt_resetAt_idx" ON "FacilitySensorEvent"("facilityId", "expiresAt", "resetAt");
CREATE INDEX "AdminSimulatorEvent_createdAt_idx" ON "AdminSimulatorEvent"("createdAt");
CREATE INDEX "AdminSimulatorEvent_resetAt_createdAt_idx" ON "AdminSimulatorEvent"("resetAt", "createdAt");

ALTER TABLE "FacilityMaintenanceWindow" ADD CONSTRAINT "FacilityMaintenanceWindow_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacilityMaintenanceWindow" ADD CONSTRAINT "FacilityMaintenanceWindow_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitySensorEvent" ADD CONSTRAINT "FacilitySensorEvent_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacilitySensorEvent" ADD CONSTRAINT "FacilitySensorEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminSimulatorEvent" ADD CONSTRAINT "AdminSimulatorEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;