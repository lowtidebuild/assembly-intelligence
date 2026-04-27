import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import {
  EXPECTED_SCHEMA_COLUMNS,
  findMissingSchemaColumns,
  quoteSqlString,
} from "../src/lib/schema-preflight";

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL_UNPOOLED 또는 DATABASE_URL이 필요합니다.",
    );
  }

  const sql = neon(databaseUrl);
  const tableNames = EXPECTED_SCHEMA_COLUMNS.map((entry) =>
    quoteSqlString(entry.table),
  ).join(", ");

  const rows = await sql.query<{
    table_name: string;
    column_name: string;
  }>(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (${tableNames})
     ORDER BY table_name, ordinal_position`,
  );

  const missing = findMissingSchemaColumns(rows);

  console.log("── schema preflight ──");
  for (const entry of EXPECTED_SCHEMA_COLUMNS) {
    const missingColumns = missing
      .filter((item) => item.table === entry.table)
      .map((item) => item.column);
    const status = missingColumns.length === 0 ? "OK" : "MISSING";
    console.log(
      `${status.padEnd(7)} ${entry.table.padEnd(18)} expected=${entry.columns.join(", ")}`,
    );
    if (missingColumns.length > 0) {
      console.log(`        missing → ${missingColumns.join(", ")}`);
    }
  }

  if (missing.length > 0) {
    console.error("\n❌ schema preflight failed");
    process.exit(1);
  }

  console.log("\n✅ schema preflight passed");
}

main().catch((error) => {
  console.error("❌ schema preflight error:", error);
  process.exit(1);
});
