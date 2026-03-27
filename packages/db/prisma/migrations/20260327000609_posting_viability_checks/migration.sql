-- CreateEnum
CREATE TYPE "PostingCheckStatus" AS ENUM ('live', 'probably_live', 'uncertain', 'dead');

-- CreateTable
CREATE TABLE "PostingCheck" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "PostingCheckStatus" NOT NULL,
    "checkerType" "ActorType" NOT NULL DEFAULT 'agent',
    "checkerLabel" TEXT NOT NULL,
    "originalUrl" TEXT,
    "finalUrl" TEXT,
    "replacementUrl" TEXT,
    "sourceBoard" TEXT,
    "evidenceJson" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostingCheck_jobId_createdAt_idx" ON "PostingCheck"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "PostingCheck_status_createdAt_idx" ON "PostingCheck"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PostingCheck" ADD CONSTRAINT "PostingCheck_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
