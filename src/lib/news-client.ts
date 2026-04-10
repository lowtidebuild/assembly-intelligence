/**
 * Naver News Search API wrapper.
 *
 * ── Why Naver ─────────────────────────────────────────────
 * Google Custom Search free tier = 100 queries/day. Naver News
 * free tier = 25,000 queries/day. For our daily sync fetching
 * news for ~10 bills per morning, Naver gives us 2,500× more
 * headroom + Korean-language optimization.
 *
 * Design.md §8 locked Naver as the provider. Reviewed in eng-review
 * round 2 (design.md CLEARED 2026-04-08).
 *
 * ── API shape ─────────────────────────────────────────────
 * GET https://openapi.naver.com/v1/search/news.json
 *   ?query=...&display=1-100&start=1-1000&sort=sim|date
 * Headers:
 *   X-Naver-Client-Id: ...
 *   X-Naver-Client-Secret: ...
 *
 * Response items have HTML entities in title/description. We
 * unescape them before persisting so the UI doesn't have to.
 *
 * ── Rate limiting ─────────────────────────────────────────
 * p-limit(3) — Naver is generous but we don't want to look like a
 * scraper. Morning sync calls ~10 times, so concurrency 3 is plenty.
 */

import pLimit from "p-limit";
import { withRetry, NonRetryableError, errorMessage } from "./api-base";

const NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json";
const limit = pLimit(3);

/** Max 100 results per query (Naver hard cap). */
const MAX_DISPLAY = 100;

/* ─────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────── */

/** Raw Naver response item (pre-normalization). */
interface NaverNewsItemRaw {
  title: string; // HTML-tagged (<b>...</b>) + entity-encoded
  originallink: string; // Publisher URL (preferred if set)
  link: string; // naver.com redirect link
  description: string; // HTML-tagged + entity-encoded
  pubDate: string; // "Wed, 09 Apr 2026 14:30:00 +0900"
}

interface NaverNewsResponseRaw {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItemRaw[];
}

/** Normalized news item — what callers and DB work with. */
export interface NewsItem {
  /** Title with HTML tags stripped + entities decoded */
  title: string;
  /** Canonical URL — originallink if present, link otherwise */
  url: string;
  /** Publisher name extracted from URL hostname */
  source: string | null;
  /** Short description, cleaned */
  description: string;
  /** Parsed Date (KST) */
  publishedAt: Date;
}

export interface SearchNewsOptions {
  /** Max results (1-100, default 5) */
  display?: number;
  /** sim = relevance, date = newest first (default date for bills) */
  sort?: "sim" | "date";
}

/* ─────────────────────────────────────────────────────────────
 * Text cleaners
 * ────────────────────────────────────────────────────────────── */

/** Decode HTML entities + strip tags. Naver loves both. */
function cleanHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "") // strip tags
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract publisher from URL. `https://n.news.naver.com/...` → "naver". */
function extractSource(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // Common Korean publisher mappings
    const map: Record<string, string> = {
      "n.news.naver.com": "네이버 뉴스",
      "news.naver.com": "네이버 뉴스",
      "news.mt.co.kr": "머니투데이",
      "etnews.com": "전자신문",
      "www.etnews.com": "전자신문",
      "dt.co.kr": "디지털타임스",
      "www.dt.co.kr": "디지털타임스",
      "zdnet.co.kr": "ZDNet Korea",
      "inews24.com": "아이뉴스24",
      "www.inews24.com": "아이뉴스24",
      "thebell.co.kr": "더벨",
      "hankyung.com": "한국경제",
      "www.hankyung.com": "한국경제",
      "mk.co.kr": "매일경제",
      "www.mk.co.kr": "매일경제",
      "chosun.com": "조선일보",
      "www.chosun.com": "조선일보",
      "joongang.co.kr": "중앙일보",
      "www.joongang.co.kr": "중앙일보",
      "donga.com": "동아일보",
      "www.donga.com": "동아일보",
      "hani.co.kr": "한겨레",
      "www.hani.co.kr": "한겨레",
      "ytn.co.kr": "YTN",
      "www.ytn.co.kr": "YTN",
      "yna.co.kr": "연합뉴스",
      "www.yna.co.kr": "연합뉴스",
    };
    return map[host] ?? host;
  } catch {
    return null;
  }
}

/**
 * Parse Naver's pubDate string. Naver uses RFC-2822 with Korean
 * timezone offset, which `new Date()` handles correctly.
 */
function parsePubDate(raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    // Fallback: best-effort treat as "now" (shouldn't happen)
    return new Date();
  }
  return d;
}

function normalize(raw: NaverNewsItemRaw): NewsItem {
  const url = raw.originallink || raw.link;
  return {
    title: cleanHtml(raw.title),
    url,
    source: extractSource(url),
    description: cleanHtml(raw.description).slice(0, 500),
    publishedAt: parsePubDate(raw.pubDate),
  };
}

/* ─────────────────────────────────────────────────────────────
 * Credentials
 * ────────────────────────────────────────────────────────────── */

function getNaverCreds(): { id: string; secret: string } {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new NonRetryableError(
      "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not set in .env.local",
    );
  }
  return { id, secret };
}

/* ─────────────────────────────────────────────────────────────
 * Public API
 * ────────────────────────────────────────────────────────────── */

/**
 * Search Naver News for a query string. Returns normalized items
 * sorted newest-first by default. Results are deduplicated by URL
 * (Naver sometimes returns the same article twice across sources).
 */
export async function searchNews(
  query: string,
  opts: SearchNewsOptions = {},
): Promise<NewsItem[]> {
  const display = Math.min(Math.max(opts.display ?? 5, 1), MAX_DISPLAY);
  const sort = opts.sort ?? "date";

  return limit(() =>
    withRetry(
      async () => {
        const { id, secret } = getNaverCreds();
        const url = new URL(NAVER_NEWS_URL);
        url.searchParams.set("query", query);
        url.searchParams.set("display", String(display));
        url.searchParams.set("sort", sort);

        const res = await fetch(url.toString(), {
          headers: {
            "X-Naver-Client-Id": id,
            "X-Naver-Client-Secret": secret,
          },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Naver returns 401 for bad creds, 429 for rate limit
          if (res.status === 401 || res.status === 403) {
            throw new NonRetryableError(
              `Naver auth failed (HTTP ${res.status}): ${body}`,
            );
          }
          throw new Error(`Naver HTTP ${res.status}: ${body}`);
        }

        const data = (await res.json()) as NaverNewsResponseRaw;
        const items = (data.items ?? []).map(normalize);

        // Deduplicate by URL (Naver sometimes returns the same
        // article from multiple syndication paths)
        const seen = new Set<string>();
        return items.filter((item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        });
      },
      { operation: `naver.search`, maxAttempts: 3, baseDelayMs: 800 },
    ),
  );
}

/**
 * Cheap health check. Calls Naver with a single-result query so we
 * can surface credential errors from /api/health.
 */
export async function pingNaver(): Promise<{ ok: boolean; error?: string }> {
  try {
    await searchNews("국회", { display: 1 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
