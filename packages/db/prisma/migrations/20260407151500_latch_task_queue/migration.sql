-- CreateEnum
CREATE TYPE "LatchTaskType" AS ENUM ('prepare_application_workspace');

-- CreateEnum
CREATE TYPE "LatchTaskStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "LatchTask" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "taskType" "LatchTaskType" NOT NULL,
    "status" "LatchTaskStatus" NOT NULL DEFAULT 'queued',
    "requestedByLabel" TEXT NOT NULL,
    "requestPayloadJson" JSONB NOT NULL,
    "responsePayloadJson" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "workerLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatchTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatchWorkerHeartbeat" (
    "workerLabel" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "processId" INTEGER,
    "hostname" TEXT,
    "dbHost" TEXT,
    "openclawBin" TEXT,
    "currentTaskId" TEXT,
    "currentTaskType" "LatchTaskType",
    "lastPolledAt" TIMESTAMP(3) NOT NULL,
    "lastClaimedTaskId" TEXT,
    "lastCompletedTaskId" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatchWorkerHeartbeat_pkey" PRIMARY KEY ("workerLabel")
);

-- CreateIndex
CREATE INDEX "LatchTask_applicationId_createdAt_idx" ON "LatchTask"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "LatchTask_status_createdAt_idx" ON "LatchTask"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "LatchTask" ADD CONSTRAINT "LatchTask_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
