import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const client = neon(process.env.DATABASE_URL_UNPOOLED!);
  await client.query(
    `ALTER TABLE "legislator" DROP COLUMN IF EXISTS "profile_image_url"`,
  );
  console.log("✅ dropped profile_image_url");

  const res = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'legislator' ORDER BY ordinal_position`,
  );
  console.log(res.map((r: { column_name: string }) => r.column_name).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
