-- CreateEnum
CREATE TYPE "ScrapeRunStatus" AS ENUM ('created', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "JobSourceRecordStatus" AS ENUM ('captured', 'normalized', 'deduped', 'rejected');

-- AlterTable
ALTER TABLE "JobScorecard" ADD COLUMN "rationale" TEXT;

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "searchTerm" TEXT,
    "searchLocation" TEXT,
    "status" "ScrapeRunStatus" NOT NULL DEFAULT 'created',
    "queryJson" JSONB,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "dedupedCount" INTEGER NOT NULL DEFAULT 0,
    "createdJobCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSourceRecord" (
    "id" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "sourceUrl" TEXT,
    "sourceCompanyName" TEXT,
    "sourceTitle" TEXT,
    "sourceLocationText" TEXT,
    "status" "JobSourceRecordStatus" NOT NULL DEFAULT 'captured',
    "rawPayload" JSONB NOT NULL,
    "normalizedPayload" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSourceLink" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobNote" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorType" "ActorType" NOT NULL DEFAULT 'agent',
    "authorLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobSourceRecord_scrapeRunId_capturedAt_idx" ON "JobSourceRecord"("scrapeRunId", "capturedAt");
CREATE INDEX "JobSourceRecord_sourceKey_sourceRecordId_idx" ON "JobSourceRecord"("sourceKey", "sourceRecordId");
CREATE UNIQUE INDEX "JobSourceLink_jobId_sourceRecordId_key" ON "JobSourceLink"("jobId", "sourceRecordId");
CREATE INDEX "JobSourceLink_sourceRecordId_idx" ON "JobSourceLink"("sourceRecordId");

-- AddForeignKey
ALTER TABLE "JobSourceRecord" ADD CONSTRAINT "JobSourceRecord_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobSourceLink" ADD CONSTRAINT "JobSourceLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobSourceLink" ADD CONSTRAINT "JobSourceLink_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "JobSourceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
