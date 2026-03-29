-- CreateTable
CREATE TABLE "NeedleWorkerHeartbeat" (
    "workerLabel" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "processId" INTEGER,
    "hostname" TEXT,
    "dbHost" TEXT,
    "openclawBin" TEXT,
    "currentTaskId" TEXT,
    "currentTaskType" "NeedleTaskType",
    "lastPolledAt" TIMESTAMP(3) NOT NULL,
    "lastClaimedTaskId" TEXT,
    "lastCompletedTaskId" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeedleWorkerHeartbeat_pkey" PRIMARY KEY ("workerLabel")
);
