/**
 * News sync — fetches Naver News for scored bills during morning sync.
 *
 * Strategy:
 *   1. For each bill with relevanceScore >= 3, run a Naver query
 *      using the bill name (trimmed to ~40 chars to avoid
 *      over-specific matches).
 *   2. Also run ONE industry-wide query using the top 2 profile
 *      keywords, billId=null, for the briefing right rail when
 *      no specific bill is selected.
 *   3. Upsert results into `news_article` with ON CONFLICT (url)
 *      DO UPDATE so reruns refresh titles/descriptions but don't
 *      create dupes.
 *   4. Optional: delete news older than 30 days at the end to keep
 *      the table bounded.
 *
 * Called from src/services/sync.ts after bills are upserted.
 */

import { db } from "@/db";
import { newsArticle, bill } from "@/db/schema";
import { and, desc, gte, isNotNull, lt, sql } from "drizzle-orm";
import { searchNews, type NewsItem } from "@/lib/news-client";
import { errorMessage } from "@/lib/api-base";

/**
 * The sync.ts orchestrator captures partial failures via an
 * `errors[]` array. We match that pattern so the news step
 * plays nicely with the existing morning-sync error reporting.
 */
export interface NewsSyncResult {
  billsQueried: number;
  articlesUpserted: number;
  errors: string[];
}

interface NewsSyncOpts {
  /** Max bills to query news for. Protects against runaway costs. */
  maxBills?: number;
  /** Results per query. Naver hard cap is 100; we want 5-10. */
  perBillDisplay?: number;
  /** How many items to fetch for the industry-wide query. */
  industryDisplay?: number;
  /** Top-N profile keywords to combine for the industry query. */
  industryKeywordCount?: number;
}

/**
 * Fetch + persist news for the current industry's scored bills.
 *
 * `profileKeywords` is passed in (rather than re-queried) because
 * the caller already has the active profile loaded. Saves a round-trip.
 */
export async function syncNews(
  profileKeywords: string[],
  opts: NewsSyncOpts = {},
): Promise<NewsSyncResult> {
  const {
    maxBills = 10,
    perBillDisplay = 5,
    industryDisplay = 10,
    industryKeywordCount = 2,
  } = opts;

  const errors: string[] = [];
  let articlesUpserted = 0;

  // ── 1. Pick the bills to query for ─────────────────────
  const targetBills = await db
    .select({
      id: bill.id,
      billName: bill.billName,
      relevanceScore: bill.relevanceScore,
    })
    .from(bill)
    .where(
      and(gte(bill.relevanceScore, 3), isNotNull(bill.relevanceScore)),
    )
    .orderBy(desc(bill.relevanceScore), desc(bill.proposalDate))
    .limit(maxBills);

  // ── 2. Per-bill fetch ─────────────────────────────────
  for (const b of targetBills) {
    try {
      // Trim bill names like "게임산업진흥에 관한 법률 일부개정법률안"
      // to a search-friendly form: drop "법률안" suffixes and truncate.
      const query = searchQueryForBill(b.billName);
      const items = await searchNews(query, {
        display: perBillDisplay,
        sort: "date",
      });
      if (items.length > 0) {
        articlesUpserted += await upsertArticles(items, query, b.id);
      }
    } catch (err) {
      errors.push(`news(${b.billName.slice(0, 30)}): ${errorMessage(err)}`);
    }
  }

  // ── 3. Industry-wide fetch ────────────────────────────
  if (profileKeywords.length > 0) {
    const industryQuery = profileKeywords
      .slice(0, industryKeywordCount)
      .join(" ");
    try {
      const items = await searchNews(industryQuery, {
        display: industryDisplay,
        sort: "date",
      });
      if (items.length > 0) {
        articlesUpserted += await upsertArticles(items, industryQuery, null);
      }
    } catch (err) {
      errors.push(`news(industry): ${errorMessage(err)}`);
    }
  }

  // ── 4. GC old news ────────────────────────────────────
  try {
    const cutoff = new Date(Date.now() - 30 * 86400 * 1000);
    await db.delete(newsArticle).where(lt(newsArticle.fetchedAt, cutoff));
  } catch (err) {
    errors.push(`news(gc): ${errorMessage(err)}`);
  }

  return {
    billsQueried: targetBills.length,
    articlesUpserted,
    errors,
  };
}

/**
 * Trim a formal Korean bill name into something Naver can match.
 *
 * "게임산업진흥에 관한 법률 일부개정법률안" → "게임산업진흥 법률 개정안"
 * "이스포츠(전자스포츠) 진흥에 관한 법률 일부개정법률안"
 *   → "이스포츠 진흥 법률 개정안"
 *
 * This is intentionally dumb — we don't want to NLP-process the
 * string, just strip the boilerplate endings that hurt recall.
 */
function searchQueryForBill(billName: string): string {
  let q = billName;
  q = q.replace(/일부개정법률안/g, "개정안");
  q = q.replace(/전부개정법률안/g, "전부개정");
  q = q.replace(/에 관한 법률/g, "법");
  q = q.replace(/\(.*?\)/g, ""); // drop parenthetical asides
  q = q.replace(/\s+/g, " ").trim();
  // Cap at ~40 chars so Naver doesn't over-narrow on exact phrase match
  if (q.length > 40) q = q.slice(0, 40);
  return q;
}

/**
 * Upsert a batch of NewsItem rows against the news_article table.
 * Dedupes by URL (unique constraint on news_article.url).
 */
async function upsertArticles(
  items: NewsItem[],
  query: string,
  billId: number | null,
): Promise<number> {
  if (items.length === 0) return 0;

  const rows = items.map((item) => ({
    billId,
    query,
    title: item.title,
    url: item.url,
    source: item.source,
    description: item.description,
    publishedAt: item.publishedAt,
  }));

  await db
    .insert(newsArticle)
    .values(rows)
    .onConflictDoUpdate({
      target: newsArticle.url,
      set: {
        title: sql`excluded.title`,
        source: sql`excluded.source`,
        description: sql`excluded.description`,
        publishedAt: sql`excluded.published_at`,
        // Preserve billId if the existing row already had one pinned,
        // otherwise adopt the new one. This prevents the industry-wide
        // query from stomping a bill-specific association.
        billId: sql`coalesce(${newsArticle.billId}, excluded.bill_id)`,
        query: sql`excluded.query`,
        fetchedAt: sql`NOW()`,
      },
    });

  return rows.length;
}

/**
 * Load recent news articles for the briefing page right rail.
 *
 * Prioritizes bill-linked articles over industry-wide ones because
 * the industry-wide query (profile keywords joined with a space)
 * tends to surface noisy adjacent stories (e.g. "무등록 성인 PC방"
 * for the 게임 industry). Bill-linked results use the specific bill
 * title as the query, which is far higher-signal.
 *
 * Ordering: bill-linked first (billId IS NOT NULL), then by
 * publishedAt desc inside each group.
 */
export async function loadRecentNews(limit = 8) {
  const since = new Date(Date.now() - 30 * 86400 * 1000);
  return db
    .select()
    .from(newsArticle)
    .where(gte(newsArticle.publishedAt, since))
    .orderBy(
      // billId IS NOT NULL → false (0) sorts before true (1) in ASC,
      // so we use DESC to push NULL-billId rows to the bottom.
      sql`${newsArticle.billId} IS NULL`,
      desc(newsArticle.publishedAt),
    )
    .limit(limit);
}
