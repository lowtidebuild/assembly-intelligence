ALTER TABLE "bill"
ADD COLUMN IF NOT EXISTS "bill_number" text;

CREATE INDEX IF NOT EXISTS "idx_bill_bill_number"
ON "bill" ("bill_number");

CREATE TABLE IF NOT EXISTS "industry_bill_watch" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "industry_profile_id" bigint NOT NULL REFERENCES "industry_profile"("id") ON DELETE CASCADE,
  "bill_id" text NOT NULL REFERENCES "bill"("bill_id") ON DELETE CASCADE,
  "added_from" text NOT NULL DEFAULT 'search',
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_industry_bill_watch" UNIQUE("industry_profile_id", "bill_id")
);
