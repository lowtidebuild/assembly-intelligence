CREATE TABLE IF NOT EXISTS "petition_item" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "petition_id" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "committee" text,
  "status" text,
  "proposer_name" text,
  "is_relevant" boolean NOT NULL DEFAULT false,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_petition_item_relevant"
ON "petition_item" ("is_relevant", "fetched_at");

CREATE TABLE IF NOT EXISTS "press_release" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "external_id" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "committee" text,
  "published_at" timestamp with time zone,
  "url" text,
  "summary" text,
  "is_relevant" boolean NOT NULL DEFAULT false,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_press_release_relevant"
ON "press_release" ("is_relevant", "published_at");
