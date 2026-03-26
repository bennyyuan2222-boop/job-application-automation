-- CreateEnum
CREATE TYPE "TailoringRunStatus" AS ENUM (
    'created',
    'generating',
    'generated_for_review',
    'edits_requested',
    'approved',
    'rejected',
    'paused',
    'failed'
);

-- AlterTable
ALTER TABLE "Application"
    ADD COLUMN "needleSessionKey" TEXT,
    ADD COLUMN "needleSessionUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TailoringRun"
    ADD COLUMN "sourceTailoringRunId" TEXT,
    ADD COLUMN "fitAssessmentJson" JSONB,
    ADD COLUMN "baseSelectionJson" JSONB,
    ADD COLUMN "generationMetadataJson" JSONB,
    ADD COLUMN "failureCode" TEXT,
    ADD COLUMN "failureMessage" TEXT,
    ADD COLUMN "failureDetailsJson" JSONB,
    ALTER COLUMN "status" DROP DEFAULT,
    ALTER COLUMN "status" TYPE "TailoringRunStatus" USING ("status"::"TailoringRunStatus"),
    ALTER COLUMN "status" SET DEFAULT 'created';

-- CreateIndex
CREATE INDEX "Application_needleSessionKey_idx" ON "Application"("needleSessionKey");

-- CreateIndex
CREATE INDEX "TailoringRun_applicationId_createdAt_idx" ON "TailoringRun"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "TailoringRun_sourceTailoringRunId_idx" ON "TailoringRun"("sourceTailoringRunId");

-- CreateIndex
CREATE INDEX "TailoringRun_status_createdAt_idx" ON "TailoringRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "TailoringRun"
    ADD CONSTRAINT "TailoringRun_sourceTailoringRunId_fkey"
    FOREIGN KEY ("sourceTailoringRunId") REFERENCES "TailoringRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
