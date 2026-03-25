-- CreateEnum
CREATE TYPE "ScoutDecisionVerdict" AS ENUM ('shortlist', 'archive', 'defer', 'needs_human_review');

-- CreateTable
CREATE TABLE "ScoutDecision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "verdict" "ScoutDecisionVerdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "ambiguityFlagsJson" JSONB,
    "actedAutomatically" BOOLEAN NOT NULL DEFAULT false,
    "policyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoutDecision_jobId_createdAt_idx" ON "ScoutDecision"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoutDecision_scrapeRunId_createdAt_idx" ON "ScoutDecision"("scrapeRunId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutDecision_jobId_scrapeRunId_key" ON "ScoutDecision"("jobId", "scrapeRunId");

-- AddForeignKey
ALTER TABLE "ScoutDecision" ADD CONSTRAINT "ScoutDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutDecision" ADD CONSTRAINT "ScoutDecision_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
