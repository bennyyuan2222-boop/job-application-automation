-- CreateEnum
CREATE TYPE "ScrapeRunTriggerType" AS ENUM ('scheduled', 'manual', 'backfill', 'test');

-- AlterEnum
ALTER TYPE "JobSourceRecordStatus" ADD VALUE 'errored';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ScrapeRunStatus" ADD VALUE 'fetching';
ALTER TYPE "ScrapeRunStatus" ADD VALUE 'processing';
ALTER TYPE "ScrapeRunStatus" ADD VALUE 'partial';
ALTER TYPE "ScrapeRunStatus" ADD VALUE 'cancelled';
