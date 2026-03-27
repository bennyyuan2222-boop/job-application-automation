-- CreateEnum
CREATE TYPE "NeedleTaskType" AS ENUM ('generate_draft', 'request_edits');

-- CreateEnum
CREATE TYPE "NeedleTaskStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "NeedleTask" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "taskType" "NeedleTaskType" NOT NULL,
    "status" "NeedleTaskStatus" NOT NULL DEFAULT 'queued',
    "requestedByLabel" TEXT NOT NULL,
    "instructions" TEXT,
    "sourceTailoringRunId" TEXT,
    "resultTailoringRunId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "workerLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeedleTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NeedleTask_applicationId_createdAt_idx" ON "NeedleTask"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "NeedleTask_status_createdAt_idx" ON "NeedleTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NeedleTask_resultTailoringRunId_idx" ON "NeedleTask"("resultTailoringRunId");

-- AddForeignKey
ALTER TABLE "NeedleTask" ADD CONSTRAINT "NeedleTask_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedleTask" ADD CONSTRAINT "NeedleTask_resultTailoringRunId_fkey"
FOREIGN KEY ("resultTailoringRunId") REFERENCES "TailoringRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
