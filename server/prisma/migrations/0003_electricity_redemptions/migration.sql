CREATE TYPE "RedemptionType" AS ENUM ('REWARD', 'ELECTRICITY');

ALTER TABLE "RewardRedemption"
ADD COLUMN "type" "RedemptionType" NOT NULL DEFAULT 'REWARD',
ADD COLUMN "meterNumber" TEXT;