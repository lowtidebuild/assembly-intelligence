import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local so drizzle-kit CLI has DATABASE_URL at runtime.
config({ path: ".env.local" });

/**
 * Drizzle config — migrations use DATABASE_URL_UNPOOLED (direct Neon
 * connection) because the Neon serverless pooler does not support
 * prepared statements, which Drizzle uses during migration.
 *
 * App runtime uses DATABASE_URL (pooled), handled in src/lib/db.ts.
 */
const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL_UNPOOLED (or DATABASE_URL) must be set in .env.local",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
  strict: true,
});
