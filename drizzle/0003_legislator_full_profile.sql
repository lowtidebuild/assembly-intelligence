-- Expand legislator table with additional MCP profile fields.
-- Source: query_assembly("nwvrqwxyaytdsfvhu", { AGE: 22 }) response.

ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "birth_date" date;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "birth_calendar" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "gender" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "term_history" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "committee_role" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "office_phone" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "staff_raw" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "secretary_raw" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "mem_title" text;
