/**
 * Morning sync cron endpoint.
 *
 * Schedule: 21:30 UTC (= 06:30 KST next day), configured in vercel.json.
 *
 * Runs the full morning sync pipeline:
 *   1. Refresh active legislators from MCP
 *   2. Fetch bills from relevant committees
 *   3. Keyword pre-filter
 *   4. Gemini relevance scoring + summary generation
 *   5. Generate and persist daily briefing
 *
 * Returns 200 with status JSON on success/partial, 500 on total failure.
 * Vercel retries 5xx responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { runMorningSync } from "@/services/sync";
import {
  getGeminiBillScorer,
  getGeminiBriefingGenerator,
} from "@/lib/gemini-client";
import {
  getStubBillScorer,
  getStubBriefingGenerator,
} from "@/lib/gemini-stub";
import { verifyCronRequest } from "@/lib/cron-auth";

// Vercel function duration. Morning sync:
//   - 1 legislator fetch (cached ≥7 days) — 0-90s
//   - 4 committee list fetches — ~10s
//   - ~20 bill detail fetches — ~30s
//   - ~5 Gemini Flash score+summary per matched bill — ~15s
//   - 1 Gemini Pro briefing generation — ~10s
//   - 1 schedule fetch — ~3s
// Worst case ~60s when legislators need refresh. Use 60s + Pro plan.
export const maxDuration = 60;

/**
 * Select scorer/generator based on env. If GEMINI_API_KEY is missing
 * we fall back to stubs so dev machines without a key can still run
 * the pipeline end-to-end.
 */
function chooseDeps() {
  if (process.env.GEMINI_API_KEY) {
    return {
      scorer: getGeminiBillScorer(),
      briefingGenerator: getGeminiBriefingGenerator(),
      mode: "gemini" as const,
    };
  }
  console.warn(
    "[cron/sync-morning] GEMINI_API_KEY not set — using stub scorer",
  );
  return {
    scorer: getStubBillScorer(),
    briefingGenerator: getStubBriefingGenerator(),
    mode: "stub" as const,
  };
}

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status ?? 401 },
    );
  }

  const { scorer, briefingGenerator, mode } = chooseDeps();

  try {
    const result = await runMorningSync({ scorer, briefingGenerator });

    const httpStatus = result.status === "failed" ? 500 : 200;
    return NextResponse.json({ mode, ...result }, { status: httpStatus });
  } catch (err) {
    console.error("[cron/sync-morning] fatal error", err);
    return NextResponse.json(
      {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
