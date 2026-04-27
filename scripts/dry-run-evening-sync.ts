/**
 * Run the evening sync pipeline directly, without going through
 * the HTTP cron endpoint.
 *
 * This writes a sync_log row and any detected stage-change updates.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runEveningSync } = await import("../src/services/sync");
  const { closeMcp } = await import("../src/lib/mcp-client");

  console.log("🚀 starting evening sync smoke...\n");
  const t0 = Date.now();

  try {
    const result = await runEveningSync();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ completed in ${elapsed}s\n`);
    console.log("Result:");
    console.log(`  status:          ${result.status}`);
    console.log(`  syncLogId:       ${result.syncLogId}`);
    console.log(`  billsChecked:    ${result.billsChecked}`);
    console.log(`  stageTransitions:${result.stageTransitions}`);
    console.log(`  alertsCreated:   ${result.alertsCreated}`);
    if (result.errors.length > 0) {
      console.log(`\n  errors (${result.errors.length}):`);
      for (const error of result.errors) console.log(`    - ${error}`);
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
