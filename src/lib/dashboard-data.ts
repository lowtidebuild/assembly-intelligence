/**
 * Server-side data loaders for the dashboard.
 *
 * Every dashboard page + the sidebar need a consistent view of:
 *   - the active IndustryProfile (brand line, keywords, llm_context)
 *   - bill counts for the sidebar badge
 *   - last sync status for the footer indicator
 *
 * These are grouped here so pages can share cache behavior and so
 * the sidebar doesn't have to duplicate queries.
 */

import { db } from "@/db";
import {
  bill,
  syncLog,
  legislator,
  industryLegislatorWatch,
  type IndustryProfile,
} from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { loadActiveIndustryProfileCompat } from "@/lib/db-compat";

export interface DashboardContext {
  profile: IndustryProfile | null;
  counts: {
    totalBills: number;
    radarBills: number; // relevanceScore >= 3
    watchedLegislators: number;
  };
  lastSync: {
    timestamp: string | null;
    status: "success" | "partial" | "failed" | "unknown";
  };
}

/**
 * Load the full context needed by the dashboard layout + sidebar.
 * Single Promise.all so the page's TTFB is bounded by the slowest query.
 */
export async function getDashboardContext(): Promise<DashboardContext> {
  const [profileRows, billStats, watchStats, lastSyncRow] = await Promise.all([
    loadActiveIndustryProfileCompat().then((profile) => (profile ? [profile] : [])),
    db
      .select({
        total: sql<number>`count(*)::int`,
        radar: sql<number>`count(*) filter (where ${bill.relevanceScore} >= 3)::int`,
      })
      .from(bill),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(industryLegislatorWatch),
    db
      .select({
        completedAt: syncLog.completedAt,
        status: syncLog.status,
      })
      .from(syncLog)
      .orderBy(desc(syncLog.startedAt))
      .limit(1),
  ]);

  const profile = profileRows[0] ?? null;
  const [b] = billStats;
  const [w] = watchStats;
  const [s] = lastSyncRow;

  return {
    profile,
    counts: {
      totalBills: b?.total ?? 0,
      radarBills: b?.radar ?? 0,
      watchedLegislators: w?.count ?? 0,
    },
    lastSync: {
      timestamp: s?.completedAt ? formatKstShort(s.completedAt) : null,
      status: (s?.status ?? "unknown") as DashboardContext["lastSync"]["status"],
    },
  };
}

/** Format a Date as "MM-DD HH:mm KST" for the sidebar footer. */
function formatKstShort(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi} KST`;
}

/** Today's KST date as "YYYY-MM-DD" */
export function todayKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** Korean weekday label for a given KST date string. */
export function weekdayKo(dateStr: string): string {
  const labels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const d = new Date(dateStr + "T00:00:00+09:00");
  return labels[d.getUTCDay()];
}

export { legislator };
