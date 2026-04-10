import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const client = neon(process.env.DATABASE_URL_UNPOOLED!);
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'bill' AND column_name LIKE '%deep%'
     ORDER BY ordinal_position`,
  );
  console.log(res);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
