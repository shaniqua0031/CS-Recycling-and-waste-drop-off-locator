-- WasteWise PostgreSQL schema. Safe to re-run in SQL editors.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('RECYCLER', 'COLLECTOR', 'FACILITY', 'ADMIN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountStatus') THEN
    CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus') THEN
    CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CollectorAvailability') THEN
    CREATE TYPE "CollectorAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'ON_COLLECTION', 'OFFLINE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FacilityMembershipRole') THEN
    CREATE TYPE "FacilityMembershipRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CollectionStatus') THEN
    CREATE TYPE "CollectionStatus" AS ENUM (
      'PENDING', 'WAITING_FOR_ADMIN', 'COLLECTOR_ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'COLLECTOR_ARRIVED',
      'COLLECTED', 'VERIFICATION_PENDING', 'VERIFIED', 'COMPLETED', 'CANCELLED', 'REJECTED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssignmentStatus') THEN
    CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'DECLINED', 'REVOKED', 'COMPLETED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RewardTransactionType') THEN
    CREATE TYPE "RewardTransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUSTMENT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RedemptionStatus') THEN
    CREATE TYPE "RedemptionStatus" AS ENUM ('REQUESTED', 'FULFILLED', 'REJECTED', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'COLLECTION_REQUEST_CREATED', 'COLLECTOR_ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'COLLECTOR_ARRIVED',
      'COLLECTION_COMPLETED', 'MATERIAL_VERIFIED', 'POINTS_AWARDED', 'REWARD_REDEEMED',
      'COLLECTOR_REGISTRATION', 'FACILITY_REGISTRATION', 'REPORT_SUBMITTED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportType') THEN
    CREATE TYPE "ReportType" AS ENUM ('INCORRECT_INFORMATION', 'SUGGEST_NEW_FACILITY', 'OTHER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportStatus') THEN
    CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecyclerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecyclerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollectorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "availability" "CollectorAvailability" NOT NULL DEFAULT 'OFFLINE',
    "serviceArea" TEXT,
    "serviceRadiusKm" DOUBLE PRECISION,
    "serviceCenterLatitude" DOUBLE PRECISION,
    "serviceCenterLongitude" DOUBLE PRECISION,
    "vehicleType" TEXT,
    "vehicleDescription" TEXT,
    "vehicleRegistration" TEXT,
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "lastLocationUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FacilityMembership" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FacilityMembershipRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FacilityOpeningHour" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FacilityOpeningHour_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Material" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FacilityMaterial" (
    "facilityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "intakeNotes" TEXT,

    CONSTRAINT "FacilityMaterial_pkey" PRIMARY KEY ("facilityId","materialId")
);

CREATE TABLE IF NOT EXISTS "MaterialRewardRate" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "pointsPerKg" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRewardRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollectionRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "destinationFacilityId" TEXT,
    "estimatedKg" DECIMAL(8,2) NOT NULL,
    "requestedFor" TIMESTAMP(3) NOT NULL,
    "requestedWindowEnd" TIMESTAMP(3),
    "pickupAddress" TEXT NOT NULL,
    "pickupLatitude" DOUBLE PRECISION NOT NULL,
    "pickupLongitude" DOUBLE PRECISION NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'PENDING',
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollectionAssignment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "collectorProfileId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "unassignedAt" TIMESTAMP(3),
    "reason" TEXT,
    "declineReasonCode" TEXT,

    CONSTRAINT "CollectionAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollectionStatusEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "CollectionStatus",
    "toStatus" "CollectionStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollectionWeight" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "estimatedKg" DECIMAL(8,2) NOT NULL,
    "actualKg" DECIMAL(8,2),
    "verifiedKg" DECIMAL(8,2),
    "recordedByUserId" TEXT,
    "verifiedByUserId" TEXT,
    "verifiedFacilityId" TEXT,
    "recordedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "CollectionWeight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RewardWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RewardTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "requestId" TEXT,
    "redemptionId" TEXT,
    "type" "RewardTransactionType" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "randValueCents" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RewardRedemption" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "facilityId" TEXT,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "suggestedName" TEXT,
    "suggestedAddress" TEXT,
    "suggestedLatitude" DOUBLE PRECISION,
    "suggestedLongitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_role_status_idx" ON "User"("role", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX IF NOT EXISTS "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RecyclerProfile_userId_key" ON "RecyclerProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CollectorProfile_userId_key" ON "CollectorProfile"("userId");
CREATE INDEX IF NOT EXISTS "CollectorProfile_approvalStatus_availability_idx" ON "CollectorProfile"("approvalStatus", "availability");
CREATE INDEX IF NOT EXISTS "Facility_approvalStatus_name_idx" ON "Facility"("approvalStatus", "name");
CREATE INDEX IF NOT EXISTS "FacilityMembership_userId_idx" ON "FacilityMembership"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "FacilityMembership_facilityId_userId_key" ON "FacilityMembership"("facilityId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "FacilityOpeningHour_facilityId_dayOfWeek_key" ON "FacilityOpeningHour"("facilityId", "dayOfWeek");
CREATE UNIQUE INDEX IF NOT EXISTS "Material_slug_key" ON "Material"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Material_name_key" ON "Material"("name");
CREATE INDEX IF NOT EXISTS "FacilityMaterial_materialId_idx" ON "FacilityMaterial"("materialId");
CREATE INDEX IF NOT EXISTS "MaterialRewardRate_materialId_endsAt_idx" ON "MaterialRewardRate"("materialId", "endsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialRewardRate_materialId_startsAt_key" ON "MaterialRewardRate"("materialId", "startsAt");
CREATE INDEX IF NOT EXISTS "CollectionRequest_requesterId_createdAt_idx" ON "CollectionRequest"("requesterId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollectionRequest_status_requestedFor_idx" ON "CollectionRequest"("status", "requestedFor");
CREATE INDEX IF NOT EXISTS "CollectionRequest_destinationFacilityId_status_idx" ON "CollectionRequest"("destinationFacilityId", "status");
CREATE INDEX IF NOT EXISTS "CollectionAssignment_requestId_assignedAt_idx" ON "CollectionAssignment"("requestId", "assignedAt");
CREATE INDEX IF NOT EXISTS "CollectionAssignment_collectorProfileId_status_idx" ON "CollectionAssignment"("collectorProfileId", "status");
CREATE INDEX IF NOT EXISTS "CollectionStatusEvent_requestId_createdAt_idx" ON "CollectionStatusEvent"("requestId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CollectionWeight_requestId_key" ON "CollectionWeight"("requestId");
CREATE INDEX IF NOT EXISTS "CollectionWeight_verifiedFacilityId_verifiedAt_idx" ON "CollectionWeight"("verifiedFacilityId", "verifiedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RewardWallet_userId_key" ON "RewardWallet"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "RewardTransaction_redemptionId_key" ON "RewardTransaction"("redemptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "RewardTransaction_idempotencyKey_key" ON "RewardTransaction"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RewardTransaction_walletId_createdAt_idx" ON "RewardTransaction"("walletId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RewardRedemption_reference_key" ON "RewardRedemption"("reference");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_fkey') THEN
    ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecyclerProfile_userId_fkey') THEN
    ALTER TABLE "RecyclerProfile" ADD CONSTRAINT "RecyclerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectorProfile_userId_fkey') THEN
    ALTER TABLE "CollectorProfile" ADD CONSTRAINT "CollectorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Facility_createdByUserId_fkey') THEN
    ALTER TABLE "Facility" ADD CONSTRAINT "Facility_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacilityMembership_facilityId_fkey') THEN
    ALTER TABLE "FacilityMembership" ADD CONSTRAINT "FacilityMembership_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacilityMembership_userId_fkey') THEN
    ALTER TABLE "FacilityMembership" ADD CONSTRAINT "FacilityMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacilityOpeningHour_facilityId_fkey') THEN
    ALTER TABLE "FacilityOpeningHour" ADD CONSTRAINT "FacilityOpeningHour_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacilityMaterial_facilityId_fkey') THEN
    ALTER TABLE "FacilityMaterial" ADD CONSTRAINT "FacilityMaterial_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacilityMaterial_materialId_fkey') THEN
    ALTER TABLE "FacilityMaterial" ADD CONSTRAINT "FacilityMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialRewardRate_materialId_fkey') THEN
    ALTER TABLE "MaterialRewardRate" ADD CONSTRAINT "MaterialRewardRate_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionRequest_requesterId_fkey') THEN
    ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionRequest_materialId_fkey') THEN
    ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionRequest_destinationFacilityId_fkey') THEN
    ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_destinationFacilityId_fkey" FOREIGN KEY ("destinationFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionAssignment_requestId_fkey') THEN
    ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CollectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionAssignment_collectorProfileId_fkey') THEN
    ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_collectorProfileId_fkey" FOREIGN KEY ("collectorProfileId") REFERENCES "CollectorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionAssignment_assignedByUserId_fkey') THEN
    ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionStatusEvent_requestId_fkey') THEN
    ALTER TABLE "CollectionStatusEvent" ADD CONSTRAINT "CollectionStatusEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CollectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionStatusEvent_actorId_fkey') THEN
    ALTER TABLE "CollectionStatusEvent" ADD CONSTRAINT "CollectionStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionWeight_requestId_fkey') THEN
    ALTER TABLE "CollectionWeight" ADD CONSTRAINT "CollectionWeight_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CollectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionWeight_recordedByUserId_fkey') THEN
    ALTER TABLE "CollectionWeight" ADD CONSTRAINT "CollectionWeight_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionWeight_verifiedByUserId_fkey') THEN
    ALTER TABLE "CollectionWeight" ADD CONSTRAINT "CollectionWeight_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectionWeight_verifiedFacilityId_fkey') THEN
    ALTER TABLE "CollectionWeight" ADD CONSTRAINT "CollectionWeight_verifiedFacilityId_fkey" FOREIGN KEY ("verifiedFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardWallet_userId_fkey') THEN
    ALTER TABLE "RewardWallet" ADD CONSTRAINT "RewardWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardTransaction_walletId_fkey') THEN
    ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "RewardWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardTransaction_requestId_fkey') THEN
    ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CollectionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardTransaction_redemptionId_fkey') THEN
    ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "RewardRedemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardRedemption_walletId_fkey') THEN
    ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "RewardWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Report_reporterId_fkey') THEN
    ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Report_facilityId_fkey') THEN
    ALTER TABLE "Report" ADD CONSTRAINT "Report_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
