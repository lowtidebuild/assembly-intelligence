#!/usr/bin/env tsx

/**
 * One-time __drizzle_migrations backfill helper.
 *
 * Reads all drizzle/*.sql migration files, computes the same hash Drizzle
 * uses (SHA-256 of the raw file contents, hex-encoded), then compares those
 * hashes with the rows already stored in drizzle.__drizzle_migrations.
 *
 * Dry-run is read-only. Apply inserts missing hashes so future
 * `drizzle-kit migrate` runs treat the historical migrations as already
 * applied.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");

if (!DRY_RUN && !APPLY) {
  console.error("Usage: backfill-drizzle-journal.ts [--dry-run | --apply]");
  process.exit(1);
}

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
}

const sql = neon(databaseUrl);
const drizzleDir = join(process.cwd(), "drizzle");

function drizzleHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function listMigrationFiles(): string[] {
  return readdirSync(drizzleDir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
}

async function tableExists(): Promise<boolean> {
  const rows = await sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'drizzle'
        and table_name = '__drizzle_migrations'
    ) as exists
  `;
  return rows[0]?.exists === true;
}

async function existingHashes(): Promise<Set<string>> {
  const exists = await tableExists();
  if (!exists) {
    return new Set();
  }

  const rows = await sql`
    select hash
    from drizzle.__drizzle_migrations
  `;

  return new Set(
    rows
      .map((row) => row.hash)
      .filter((hash): hash is string => typeof hash === "string"),
  );
}

async function ensureTrackingTable() {
  await sql`create schema if not exists drizzle`;
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;
}

async function main() {
  const files = listMigrationFiles();
  const knownHashes = await existingHashes();
  const syntheticCreatedAtBase = Date.now();

  console.log(`Found ${files.length} migration files.`);

  let missingCount = 0;

  for (const file of files) {
    const content = readFileSync(join(drizzleDir, file), "utf8");
    const hash = drizzleHash(content);
    const tag = file.replace(/\.sql$/, "");

    if (knownHashes.has(hash)) {
      console.log(`  [skip] ${tag} already tracked (hash=${hash.slice(0, 8)}...)`);
      continue;
    }

    missingCount += 1;

    if (DRY_RUN) {
      console.log(`  [dry-run] would insert ${tag} (hash=${hash.slice(0, 8)}...)`);
      continue;
    }

    await ensureTrackingTable();
    await sql`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${syntheticCreatedAtBase + missingCount})
    `;
    console.log(`  [apply] inserted ${tag}`);
  }

  if (DRY_RUN) {
    console.log(
      `\nDry run complete. ${missingCount} migration(s) would be inserted. No changes applied.`,
    );
    return;
  }

  console.log(`\nBackfill complete. Inserted ${missingCount} migration(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
