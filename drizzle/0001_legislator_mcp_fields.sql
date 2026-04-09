-- Legislator schema aligned to real MCP fields (nwvrqwxyaytdsfvhu).
-- See docs/mcp-api-reality.md for field mapping.
--
-- Dropped:
--   profile_image_url — no MCP endpoint exposes legislator photos
--
-- Added:
--   name_english    — ENG_NM
--   election_type   — ELECT_GBN_NM ("지역구"/"비례대표")
--   email           — E_MAIL
--   homepage        — HOMEPAGE
--   office_address  — ASSEM_ADDR ("의원회관 515호")

ALTER TABLE "legislator" DROP COLUMN IF EXISTS "profile_image_url";
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "name_english" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "election_type" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "homepage" text;
ALTER TABLE "legislator" ADD COLUMN IF NOT EXISTS "office_address" text;
