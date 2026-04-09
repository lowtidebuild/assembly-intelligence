import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const client = neon(process.env.DATABASE_URL_UNPOOLED!);
  const res = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'legislator' ORDER BY ordinal_position`,
  );
  console.log(res);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
