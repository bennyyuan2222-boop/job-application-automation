-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "externalApplicationId" TEXT,
ADD COLUMN     "submissionNote" TEXT,
ADD COLUMN     "submitReviewCapturedAt" TIMESTAMP(3),
ADD COLUMN     "submitReviewDirtyAt" TIMESTAMP(3),
ADD COLUMN     "submitReviewDirtyReason" TEXT,
ADD COLUMN     "submitReviewPacketHash" TEXT,
ADD COLUMN     "submitReviewPacketJson" JSONB,
ADD COLUMN     "submittedPortalDomain" TEXT,
ADD COLUMN     "submittedPortalUrl" TEXT;
