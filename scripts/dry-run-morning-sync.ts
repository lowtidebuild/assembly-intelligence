/**
 * Run the morning sync pipeline directly, without going through the
 * HTTP cron endpoint.
 *
 * This script writes to the configured DATABASE_URL. It requires
 * `--apply` so it is not mistaken for a no-write dry-run.
 *
 *   pnpm tsx scripts/dry-run-morning-sync.ts --apply          # real Gemini
 *   ALLOW_AI_STUB=1 ALLOW_STUB_DB_WRITE=1 \
 *     pnpm tsx scripts/dry-run-morning-sync.ts --apply --stub # local stub
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.error(
      [
        "Refusing to run: scripts/dry-run-morning-sync.ts writes to DATABASE_URL.",
        "Re-run with --apply if you intend to write sync output.",
        "Stub writes also require ALLOW_AI_STUB=1 and ALLOW_STUB_DB_WRITE=1 outside production.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const forceStub = process.argv.includes("--stub");

  const { runMorningSync } = await import("../src/services/sync");
  const { closeMcp } = await import("../src/lib/mcp-client");
  const {
    assertStubDbWriteAllowed,
    shouldUseGeminiOrThrow,
  } = await import("../src/lib/gemini-client");

  const useGemini = forceStub
    ? false
    : shouldUseGeminiOrThrow("scripts/dry-run-morning-sync");
  const useStub = !useGemini;
  if (useStub) {
    assertStubDbWriteAllowed("scripts/dry-run-morning-sync");
  }

  const { scorer, briefingGenerator, mode } = useStub
    ? await (async () => {
        const mod = await import("../src/lib/gemini-stub");
        return {
          scorer: mod.getStubBillScorer(),
          briefingGenerator: mod.getStubBriefingGenerator(),
          mode: "stub" as const,
        };
      })()
    : await (async () => {
        const mod = await import("../src/lib/gemini-client");
        return {
          scorer: mod.getGeminiBillScorer(),
          briefingGenerator: mod.getGeminiBriefingGenerator(),
          mode: "gemini" as const,
        };
      })();

  console.log(`🚀 starting morning sync dry-run (scorer=${mode})...\n`);
  const t0 = Date.now();

  try {
    const result = await runMorningSync({ scorer, briefingGenerator, aiMode: mode });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ completed in ${elapsed}s\n`);
    console.log("Result:");
    console.log(`  status:            ${result.status}`);
    console.log(`  syncLogId:         ${result.syncLogId}`);
    console.log(`  billsProcessed:    ${result.billsProcessed}`);
    console.log(`  billsScored:       ${result.billsScored}`);
    console.log(`  legislatorsUpdated:${result.legislatorsUpdated}`);
    console.log(`  briefingDate:      ${result.briefingDate}`);
    if (result.errors.length > 0) {
      console.log(`\n  errors (${result.errors.length}):`);
      for (const e of result.errors) console.log(`    - ${e}`);
    }
  } catch (err) {
    console.error("\n❌ sync failed:", err);
    await closeMcp();
    process.exit(1);
  }
  await closeMcp();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
