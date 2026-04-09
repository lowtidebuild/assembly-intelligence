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
  getStubBillScorer,
  getStubBriefingGenerator,
} from "@/lib/gemini-stub";
import { verifyCronRequest } from "@/lib/cron-auth";

// Vercel max function duration for Hobby: 10s.
// Morning sync can exceed this with many Gemini calls. Pro plan: 60s.
// For MVP we stay under 10s by using stub scorer until Lane B is ready.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status ?? 401 },
    );
  }

  try {
    const result = await runMorningSync({
      scorer: getStubBillScorer(),
      briefingGenerator: getStubBriefingGenerator(),
    });

    const httpStatus = result.status === "failed" ? 500 : 200;
    return NextResponse.json(result, { status: httpStatus });
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
