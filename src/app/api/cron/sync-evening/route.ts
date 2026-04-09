/**
 * Evening sync cron endpoint.
 *
 * Schedule: 09:30 UTC (= 18:30 KST), configured in vercel.json.
 *
 * Runs the lightweight change detection pipeline:
 *   1. Pull high-relevance, non-terminal bills from DB
 *   2. For each, call get_bill_detail from MCP
 *   3. If stage changed: update + create alert + write timeline entry
 *
 * No Gemini calls. No briefing regeneration. Designed to run in <10s
 * for Vercel Hobby plan compatibility.
 */

import { NextRequest, NextResponse } from "next/server";
import { runEveningSync } from "@/services/sync";
import { verifyCronRequest } from "@/lib/cron-auth";

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
    const result = await runEveningSync();
    const httpStatus = result.status === "failed" ? 500 : 200;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    console.error("[cron/sync-evening] fatal error", err);
    return NextResponse.json(
      {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
