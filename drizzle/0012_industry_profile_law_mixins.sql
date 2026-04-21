ALTER TABLE "industry_profile"
ADD COLUMN IF NOT EXISTS "selected_law_mixins" jsonb NOT NULL DEFAULT '[]'::jsonb;
