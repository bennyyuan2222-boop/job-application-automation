-- AlterTable
ALTER TABLE "ScrapeRun" ADD COLUMN     "capturedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorSummaryJson" JSONB,
ADD COLUMN     "erroredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fetchedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "normalizedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rejectedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "triggerType" "ScrapeRunTriggerType" NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE INDEX "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt");

-- CreateIndex
CREATE INDEX "ScrapeRun_triggerType_startedAt_idx" ON "ScrapeRun"("triggerType", "startedAt");

-- CreateIndex
CREATE INDEX "ScrapeRun_idempotencyKey_idx" ON "ScrapeRun"("idempotencyKey");
