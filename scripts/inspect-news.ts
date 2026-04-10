/**
 * Show recent news articles fetched by news-sync.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const { newsArticle } = await import("../src/db/schema");
  const { desc, sql } = await import("drizzle-orm");

  const [count] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(newsArticle);
  console.log(`── news_article count: ${count.c} ──`);

  const withBill = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(newsArticle)
    .where(sql`${newsArticle.billId} IS NOT NULL`);
  const withoutBill = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(newsArticle)
    .where(sql`${newsArticle.billId} IS NULL`);

  console.log(`  bill-linked:    ${withBill[0]?.c ?? 0}`);
  console.log(`  industry-wide:  ${withoutBill[0]?.c ?? 0}`);

  const rows = await db
    .select()
    .from(newsArticle)
    .orderBy(desc(newsArticle.publishedAt))
    .limit(10);

  console.log("\n── latest 10 ──");
  for (const n of rows) {
    const date = n.publishedAt?.toISOString().slice(0, 10) ?? "?";
    console.log(
      `[${n.source ?? "?"}] ${date} · bill=${n.billId ?? "-"} · ${n.title.slice(0, 60)}...`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
