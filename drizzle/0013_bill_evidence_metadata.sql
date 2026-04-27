ALTER TABLE "bill"
  ADD COLUMN IF NOT EXISTS "evidence_level" text,
  ADD COLUMN IF NOT EXISTS "body_fetch_status" text,
  ADD COLUMN IF NOT EXISTS "evidence_meta" jsonb;

CREATE INDEX IF NOT EXISTS "idx_bill_evidence_level"
  ON "bill" ("evidence_level");
