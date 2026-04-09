/**
 * Database client — Neon Postgres via Drizzle ORM
 *
 * Uses Neon's HTTP driver which works in:
 *   - Node.js (dev, migrations, scripts)
 *   - Edge runtime (Next.js API routes, Server Components)
 *   - Vercel serverless functions
 *
 * The HTTP driver is stateless — each query opens a fresh HTTPS
 * connection — so it pairs well with the Neon connection pooler
 * (DATABASE_URL) in serverless. We use the pooled URL here because
 * app runtime connections should be short-lived and reusable.
 *
 * Migrations use DATABASE_URL_UNPOOLED (direct connection) because
 * Drizzle's migration engine uses prepared statements which the
 * pooler does not support. See drizzle.config.ts.
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (pooled Neon connection).",
  );
}

// Neon HTTP client — stateless, one query per request
const sql = neon(databaseUrl);

// Drizzle instance with full schema for relational queries
export const db = drizzle(sql, { schema });

// Re-export schema and types for convenient imports elsewhere
export * from "./schema";
