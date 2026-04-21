import { execSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;

function log(message: string) {
  console.log(`[deploy-migrate] ${message}`);
}

function main() {
  log(`VERCEL_ENV=${vercelEnv ?? "<unset>"}`);

  if (vercelEnv !== "production") {
    log("Not a production deploy -> skipping migration.");
    return;
  }

  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      "[deploy-migrate] ERROR: DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set.",
    );
    process.exit(1);
  }

  log("Running drizzle-kit migrate against production DB...");

  try {
    execSync("pnpm exec drizzle-kit migrate", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL_UNPOOLED: connectionString,
      },
    });
    log("Migration complete.");
  } catch (error) {
    console.error(
      "[deploy-migrate] Migration FAILED - build will be cancelled.",
    );
    console.error(error);
    process.exit(1);
  }
}

main();
