/**
 * Dry-run the morning sync pipeline directly, without going through
 * the HTTP cron endpoint. Uses stub Gemini + briefing generator.
 *
 * Prints:
 *   - which committees were queried
 *   - how many bills were returned
 *   - how many passed keyword filter
 *   - how many got scored + upserted
 *   - final sync log row
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runMorningSync } = await import("../src/services/sync");
  const { getStubBillScorer, getStubBriefingGenerator } = await import(
    "../src/lib/gemini-stub"
  );
  const { closeMcp } = await import("../src/lib/mcp-client");

  console.log("🚀 starting morning sync dry-run...\n");
  const t0 = Date.now();

  try {
    const result = await runMorningSync({
      scorer: getStubBillScorer(),
      briefingGenerator: getStubBriefingGenerator(),
    });

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
