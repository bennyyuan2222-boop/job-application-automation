-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('discovered', 'shortlisted', 'archived');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('remote', 'hybrid', 'onsite', 'unknown');

-- CreateEnum
CREATE TYPE "ResumeVersionKind" AS ENUM ('base', 'tailored');

-- CreateEnum
CREATE TYPE "ResumeCreatedByType" AS ENUM ('manual', 'agent', 'system');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('tailoring', 'tailoring_review', 'paused', 'applying', 'submit_review', 'submitted', 'archived');

-- CreateEnum
CREATE TYPE "AnswerSourceType" AS ENUM ('manual', 'agent', 'resume', 'derived');

-- CreateEnum
CREATE TYPE "AnswerReviewState" AS ENUM ('accepted', 'needs_review', 'blocked');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('resume', 'other');

-- CreateEnum
CREATE TYPE "PortalSessionMode" AS ENUM ('manual', 'automation', 'hybrid');

-- CreateEnum
CREATE TYPE "PortalSessionStatus" AS ENUM ('not_started', 'in_progress', 'ready_for_review', 'submitted', 'abandoned');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'agent', 'system');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "companyId" TEXT NOT NULL,
    "aiNativeScore" INTEGER,
    "brandValueScore" INTEGER,
    "growthSignalScore" INTEGER,
    "qualitySummary" TEXT,
    "signalsJson" JSONB,
    "lastEnrichedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "locationText" TEXT NOT NULL,
    "workMode" "WorkMode" NOT NULL DEFAULT 'unknown',
    "employmentType" TEXT,
    "salaryText" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "jobUrl" TEXT NOT NULL,
    "jobDescriptionRaw" TEXT NOT NULL,
    "jobDescriptionClean" TEXT,
    "jobRequirementsJson" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JobStatus" NOT NULL DEFAULT 'discovered',
    "duplicateOfJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobScorecard" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fitScore" DOUBLE PRECISION NOT NULL,
    "companyQualityScore" DOUBLE PRECISION NOT NULL,
    "aiRelevanceScore" DOUBLE PRECISION NOT NULL,
    "freshnessScore" DOUBLE PRECISION NOT NULL,
    "priorityScore" DOUBLE PRECISION NOT NULL,
    "topReasonsJson" JSONB,
    "risksJson" JSONB,
    "scorerType" TEXT NOT NULL DEFAULT 'system',
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "kind" "ResumeVersionKind" NOT NULL,
    "parentResumeVersionId" TEXT,
    "title" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "sectionsJson" JSONB,
    "renderedPdfUrl" TEXT,
    "renderedDocxUrl" TEXT,
    "changeSummaryJson" JSONB,
    "createdByType" "ResumeCreatedByType" NOT NULL DEFAULT 'agent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'tailoring',
    "baseResumeVersionId" TEXT NOT NULL,
    "tailoredResumeVersionId" TEXT,
    "portalUrl" TEXT,
    "portalDomain" TEXT,
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "missingRequiredCount" INTEGER NOT NULL DEFAULT 0,
    "lowConfidenceCount" INTEGER NOT NULL DEFAULT 0,
    "pausedReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailoringRun" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "inputResumeVersionId" TEXT NOT NULL,
    "outputResumeVersionId" TEXT,
    "jobSnapshotJson" JSONB,
    "instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "revisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TailoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldGroup" TEXT,
    "answerJson" JSONB,
    "sourceType" "AnswerSourceType" NOT NULL DEFAULT 'agent',
    "confidence" DOUBLE PRECISION,
    "reviewState" "AnswerReviewState" NOT NULL DEFAULT 'needs_review',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAttachment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "attachmentType" "AttachmentType" NOT NULL DEFAULT 'resume',
    "resumeVersionId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "mode" "PortalSessionMode" NOT NULL DEFAULT 'manual',
    "launchUrl" TEXT NOT NULL,
    "providerDomain" TEXT NOT NULL,
    "status" "PortalSessionStatus" NOT NULL DEFAULT 'not_started',
    "lastKnownPageTitle" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "sessionSummaryJson" JSONB,
    "notes" TEXT,

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_normalizedName_key" ON "Company"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAnswer_applicationId_fieldKey_key" ON "ApplicationAnswer"("applicationId", "fieldKey");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScorecard" ADD CONSTRAINT "JobScorecard_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_parentResumeVersionId_fkey" FOREIGN KEY ("parentResumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_baseResumeVersionId_fkey" FOREIGN KEY ("baseResumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_tailoredResumeVersionId_fkey" FOREIGN KEY ("tailoredResumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoringRun" ADD CONSTRAINT "TailoringRun_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoringRun" ADD CONSTRAINT "TailoringRun_inputResumeVersionId_fkey" FOREIGN KEY ("inputResumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoringRun" ADD CONSTRAINT "TailoringRun_outputResumeVersionId_fkey" FOREIGN KEY ("outputResumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttachment" ADD CONSTRAINT "ApplicationAttachment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttachment" ADD CONSTRAINT "ApplicationAttachment_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
