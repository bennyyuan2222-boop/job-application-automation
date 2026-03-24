-- AlterTable
ALTER TABLE "TailoringRun" ADD COLUMN     "changeSummaryJson" JSONB,
ADD COLUMN     "rationaleJson" JSONB,
ADD COLUMN     "risksJson" JSONB;
