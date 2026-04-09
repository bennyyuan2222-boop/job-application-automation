-- AlterTable
ALTER TABLE "ApplicationAnswer" ADD COLUMN     "profileAnswerId" TEXT;

-- CreateTable
CREATE TABLE "ProfileAnswer" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldGroup" TEXT,
    "answerJson" JSONB,
    "sourceType" "AnswerSourceType" NOT NULL DEFAULT 'manual',
    "confidence" DOUBLE PRECISION,
    "reviewState" "AnswerReviewState" NOT NULL DEFAULT 'needs_review',
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileAnswer_ownerUserId_isArchived_idx" ON "ProfileAnswer"("ownerUserId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileAnswer_ownerUserId_fieldKey_key" ON "ProfileAnswer"("ownerUserId", "fieldKey");

-- CreateIndex
CREATE INDEX "ApplicationAnswer_profileAnswerId_idx" ON "ApplicationAnswer"("profileAnswerId");

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_profileAnswerId_fkey" FOREIGN KEY ("profileAnswerId") REFERENCES "ProfileAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAnswer" ADD CONSTRAINT "ProfileAnswer_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
