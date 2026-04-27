/**
 * Dry-run the morning sync pipeline directly, without going through
 * the HTTP cron endpoint.
 *
 * By default uses real Gemini (if GEMINI_API_KEY is set). Pass
 * `--stub` to force the stub scorer instead (cheaper, zero cost):
 *
 *   pnpm tsx scripts/dry-run-morning-sync.ts          # real Gemini
 *   pnpm tsx scripts/dry-run-morning-sync.ts --stub   # stub
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const useStub =
    process.argv.includes("--stub") || !process.env.GEMINI_API_KEY;

  const { runMorningSync } = await import("../src/services/sync");
  const { closeMcp } = await import("../src/lib/mcp-client");

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
