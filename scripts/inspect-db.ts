/**
 * Quick DB inspection after a sync dry-run. Prints counts + a few
 * sample rows from each affected table.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const {
    bill,
    legislator,
    dailyBriefing,
    syncLog,
    industryProfile,
  } = await import("../src/db/schema");
  const { desc } = await import("drizzle-orm");

  // Counts
  const { sql } = await import("drizzle-orm");
  const [lc] = await db.select({ c: sql<number>`count(*)::int` }).from(legislator);
  const [bc] = await db.select({ c: sql<number>`count(*)::int` }).from(bill);
  const [dbc] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(dailyBriefing);
  const [slc] = await db.select({ c: sql<number>`count(*)::int` }).from(syncLog);
  const [pc] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(industryProfile);

  console.log("── table counts ──");
  console.log(`  industry_profile:  ${pc.c}`);
  console.log(`  legislator:        ${lc.c}`);
  console.log(`  bill:              ${bc.c}`);
  console.log(`  daily_briefing:    ${dbc.c}`);
  console.log(`  sync_log:          ${slc.c}`);

  // Recent bills
  const bills = await db
    .select({
      id: bill.id,
      billId: bill.billId,
      billName: bill.billName,
      stage: bill.stage,
      score: bill.relevanceScore,
      proposer: bill.proposerName,
      party: bill.proposerParty,
      date: bill.proposalDate,
    })
    .from(bill)
    .orderBy(desc(bill.proposalDate))
    .limit(10);

  console.log("\n── latest bills ──");
  for (const b of bills) {
    console.log(
      `  [${b.stage}] ${b.billName} — ${b.proposer}(${b.party ?? "?"}), score=${b.score}`,
    );
  }

  // Latest briefing
  const briefings = await db
    .select({
      date: dailyBriefing.date,
      keyItemCount: dailyBriefing.keyItemCount,
      scheduleCount: dailyBriefing.scheduleCount,
      newBillCount: dailyBriefing.newBillCount,
      htmlPreview: sql<string>`SUBSTRING(${dailyBriefing.contentHtml}, 1, 100)`,
    })
    .from(dailyBriefing)
    .orderBy(desc(dailyBriefing.date))
    .limit(3);

  console.log("\n── briefings ──");
  for (const b of briefings) {
    console.log(
      `  ${b.date}: key=${b.keyItemCount} sched=${b.scheduleCount} new=${b.newBillCount}`,
    );
    console.log(`    ${b.htmlPreview.replace(/\s+/g, " ")}...`);
  }

  // Recent sync logs
  const logs = await db
    .select()
    .from(syncLog)
    .orderBy(desc(syncLog.startedAt))
    .limit(5);

  console.log("\n── recent sync logs ──");
  for (const l of logs) {
    console.log(
      `  [${l.syncType}] ${l.status} — bills=${l.billsProcessed}/${l.billsScored}, legis=${l.legislatorsUpdated}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
