/**
 * Smoke test for the Naver News client. Prints a few results for
 * a real bill name to confirm auth, normalization, and publisher
 * mapping all work.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { searchNews, pingNaver } = await import("../src/lib/news-client");

  console.log("── ping ──");
  const ping = await pingNaver();
  console.log(`  ok=${ping.ok}${ping.error ? ` error=${ping.error}` : ""}`);
  if (!ping.ok) process.exit(1);

  const queries = [
    "게임산업진흥법 개정안",
    "확률형 아이템",
    "이스포츠 진흥법",
  ];

  for (const q of queries) {
    console.log(`\n── query: ${q} ──`);
    const t0 = Date.now();
    const items = await searchNews(q, { display: 5, sort: "date" });
    console.log(`  ${Date.now() - t0}ms · ${items.length} items`);
    for (const item of items.slice(0, 3)) {
      console.log(`  • [${item.source ?? "?"}] ${item.title}`);
      console.log(
        `    ${item.publishedAt.toISOString().slice(0, 10)} · ${item.url.slice(0, 60)}...`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ failed:", err);
    process.exit(1);
  });
