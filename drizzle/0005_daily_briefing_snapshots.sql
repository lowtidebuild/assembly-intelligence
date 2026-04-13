ALTER TABLE "daily_briefing"
ADD COLUMN "key_bill_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "daily_briefing"
ADD COLUMN "new_bill_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
