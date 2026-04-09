import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const { dailyBriefing, bill } = await import("../src/db/schema");
  const { desc } = await import("drizzle-orm");

  const [latest] = await db
    .select()
    .from(dailyBriefing)
    .orderBy(desc(dailyBriefing.date))
    .limit(1);

  if (!latest) {
    console.log("no briefing");
    return;
  }

  console.log(`── briefing ${latest.date} ──`);
  console.log(
    `  key=${latest.keyItemCount} sched=${latest.scheduleCount} new=${latest.newBillCount}`,
  );
  console.log(`  generated: ${latest.generatedAt}`);
  console.log("");
  console.log(latest.contentHtml);

  console.log("\n── bill scores + reasonings ──");
  const bills = await db
    .select()
    .from(bill)
    .orderBy(desc(bill.relevanceScore));
  for (const b of bills) {
    console.log(`\n[${b.relevanceScore}/5] ${b.billName}`);
    console.log(`  제안: ${b.proposerName} (${b.proposerParty ?? "?"})`);
    console.log(`  판단: ${b.relevanceReasoning}`);
    if (b.summaryText) console.log(`  요약: ${b.summaryText}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
