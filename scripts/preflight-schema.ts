import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

interface ExpectedTable {
  table: string;
  columns: string[];
}

const EXPECTED: ExpectedTable[] = [
  {
    table: "daily_briefing",
    columns: ["key_bill_ids", "new_bill_ids"],
  },
  {
    table: "legislator",
    columns: ["photo_url"],
  },
  {
    table: "bill",
    columns: ["bill_number", "proposal_reason", "main_content"],
  },
  {
    table: "petition_item",
    columns: ["petition_id", "title", "is_relevant"],
  },
  {
    table: "press_release",
    columns: ["title", "committee", "is_relevant"],
  },
  {
    table: "industry_profile",
    columns: ["exclude_keywords", "selected_law_mixins"],
  },
];

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL_UNPOOLED 또는 DATABASE_URL이 필요합니다.",
    );
  }

  const sql = neon(databaseUrl);
  const tableNames = EXPECTED.map((entry) => quote(entry.table)).join(", ");

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

  const actual = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!actual.has(row.table_name)) {
      actual.set(row.table_name, new Set());
    }
    actual.get(row.table_name)!.add(row.column_name);
  }

  const missing: Array<{ table: string; columns: string[] }> = [];

  console.log("── schema preflight ──");
  for (const entry of EXPECTED) {
    const present = actual.get(entry.table) ?? new Set<string>();
    const missingColumns = entry.columns.filter((column) => !present.has(column));
    const status = missingColumns.length === 0 ? "OK" : "MISSING";
    console.log(
      `${status.padEnd(7)} ${entry.table.padEnd(18)} expected=${entry.columns.join(", ")}`,
    );
    if (missingColumns.length > 0) {
      console.log(`        missing → ${missingColumns.join(", ")}`);
      missing.push({ table: entry.table, columns: missingColumns });
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
