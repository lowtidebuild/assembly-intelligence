ALTER TABLE "industry_profile"
ADD COLUMN IF NOT EXISTS "exclude_keywords" jsonb NOT NULL DEFAULT '[]'::jsonb;
