-- Persist Gemini Pro deep analysis results on the bill row.
-- Triggered on-demand via POST /api/bills/[id]/analyze. Once generated,
-- subsequent loads of the impact page show the cached analysis until
-- someone clicks "재생성".

ALTER TABLE "bill" ADD COLUMN IF NOT EXISTS "deep_analysis" jsonb;
ALTER TABLE "bill" ADD COLUMN IF NOT EXISTS "deep_analysis_generated_at" timestamptz;
