ALTER TABLE "daily_briefing"
  ADD COLUMN IF NOT EXISTS "content_json" jsonb;
