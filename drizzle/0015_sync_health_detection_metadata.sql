ALTER TABLE "sync_log"
  ADD COLUMN IF NOT EXISTS "metadata_json" jsonb;

ALTER TABLE "bill"
  ADD COLUMN IF NOT EXISTS "discovery_sources" jsonb,
  ADD COLUMN IF NOT EXISTS "discovery_keywords" jsonb,
  ADD COLUMN IF NOT EXISTS "analysis_meta" jsonb;
