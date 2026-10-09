ALTER TABLE "Incident"
ADD COLUMN "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "priorityFactors" JSONB,
ADD COLUMN "priorityOverridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "priorityOverriddenByUserId" TEXT,
ADD COLUMN "priorityOverrideReason" TEXT,
ADD COLUMN "priorityOverriddenAt" TIMESTAMP(3),
ADD COLUMN "assignedCollectorProfileId" TEXT;

ALTER TABLE "Incident"
ADD CONSTRAINT "Incident_priorityOverriddenByUserId_fkey"
FOREIGN KEY ("priorityOverriddenByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "Incident_assignedCollectorProfileId_fkey"
FOREIGN KEY ("assignedCollectorProfileId") REFERENCES "CollectorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Incident_assignedCollectorProfileId_resolvedAt_idx"
ON "Incident"("assignedCollectorProfileId", "resolvedAt");