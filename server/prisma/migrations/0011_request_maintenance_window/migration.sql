ALTER TABLE "CollectionRequest" ADD COLUMN "maintenanceWindowId" TEXT;

ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_maintenanceWindowId_fkey"
FOREIGN KEY ("maintenanceWindowId") REFERENCES "FacilityMaintenanceWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CollectionRequest_maintenanceWindowId_status_idx" ON "CollectionRequest"("maintenanceWindowId", "status");