/**
 * Apply a specific SQL migration file directly against DATABASE_URL_UNPOOLED.
 *
 * Usage: pnpm tsx scripts/apply-migration.ts drizzle/0001_legislator_mcp_fields.sql
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx scripts/apply-migration.ts <path.sql>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error("DATABASE_URL_UNPOOLED is not set in .env.local");
    process.exit(1);
  }

  const sql = readFileSync(file, "utf-8");
  // Strip all -- line comments FIRST, then split on semicolons.
  // Original bug: splitting first meant comment lines got glued to
  // the next statement, and the filter's `startsWith("--")` check
  // dropped the whole statement.
  const stripped = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = stripped
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const client = neon(url);
  console.log(`Applying ${statements.length} statements from ${file}...`);
  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
    console.log(`  → ${preview}${stmt.length > 80 ? "..." : ""}`);
    await client.query(stmt);
  }
  console.log("✅ applied");
}

main().catch((err) => {
  console.error("❌ failed:", err);
  process.exit(1);
});
