import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const { newsArticle, bill } = await import("../src/db/schema");
  const { desc, eq, isNotNull } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: newsArticle.id,
      billName: bill.billName,
      title: newsArticle.title,
      source: newsArticle.source,
      publishedAt: newsArticle.publishedAt,
    })
    .from(newsArticle)
    .innerJoin(bill, eq(newsArticle.billId, bill.id))
    .where(isNotNull(newsArticle.billId))
    .orderBy(desc(newsArticle.publishedAt))
    .limit(20);

  console.log(`── bill-linked news (${rows.length}) ──`);
  for (const n of rows) {
    const d = n.publishedAt?.toISOString().slice(0, 10) ?? "?";
    console.log(`[${n.source ?? "?"}] ${d}`);
    console.log(`  bill: ${n.billName.slice(0, 40)}`);
    console.log(`  news: ${n.title.slice(0, 70)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
