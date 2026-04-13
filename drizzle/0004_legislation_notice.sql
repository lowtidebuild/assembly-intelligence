CREATE TABLE IF NOT EXISTS "legislation_notice" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "bill_number" text NOT NULL UNIQUE,
  "bill_name" text NOT NULL,
  "proposer_type" text,
  "committee" text,
  "notice_end_date" date,
  "is_relevant" boolean NOT NULL DEFAULT false,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_legislation_notice_relevant"
  ON "legislation_notice" ("is_relevant", "notice_end_date");
