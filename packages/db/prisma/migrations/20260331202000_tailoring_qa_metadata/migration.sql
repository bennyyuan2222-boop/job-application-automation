-- Add QA metadata for tailoring runs so density analysis results can be surfaced in admin/debug views.
ALTER TABLE "TailoringRun"
ADD COLUMN "qaMetadataJson" JSONB;
