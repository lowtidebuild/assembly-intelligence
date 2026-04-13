CREATE TABLE IF NOT EXISTS "committee_transcript" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "minutes_id" text NOT NULL UNIQUE,
  "source" text NOT NULL DEFAULT 'record_xml',
  "committee" text,
  "meeting_name" text NOT NULL,
  "meeting_date" date,
  "session_label" text,
  "place" text,
  "agenda_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_url" text,
  "pdf_url" text,
  "video_url" text,
  "full_text" text,
  "utterance_count" integer NOT NULL DEFAULT 0,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_committee_transcript_meeting_date"
ON "committee_transcript" ("meeting_date");

CREATE INDEX IF NOT EXISTS "idx_committee_transcript_committee_date"
ON "committee_transcript" ("committee", "meeting_date");

CREATE TABLE IF NOT EXISTS "committee_transcript_utterance" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "transcript_id" bigint NOT NULL REFERENCES "committee_transcript"("id") ON DELETE cascade,
  "sort_order" integer NOT NULL,
  "speaker_name" text NOT NULL,
  "speaker_role" text,
  "speaker_area" text,
  "speaker_profile_url" text,
  "speaker_photo_url" text,
  "content" text NOT NULL,
  "matched_keywords" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "has_keyword_match" boolean NOT NULL DEFAULT false,
  "snippet" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_committee_transcript_utterance"
ON "committee_transcript_utterance" ("transcript_id", "sort_order");

CREATE INDEX IF NOT EXISTS "idx_committee_transcript_utterance_transcript"
ON "committee_transcript_utterance" ("transcript_id", "sort_order");

CREATE INDEX IF NOT EXISTS "idx_committee_transcript_utterance_match"
ON "committee_transcript_utterance" ("has_keyword_match", "transcript_id");
