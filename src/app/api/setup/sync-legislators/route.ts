/**
 * POST /api/setup/sync-legislators
 *
 * One-click trigger for the 22대 legislator roster fetch. Used by
 * the setup wizard when the legislator table is empty — otherwise
 * the hemicycle picker has nothing to render.
 *
 * Slow — first call after the MCP upstream has been idle takes
 * 60-90s. maxDuration bumped to match.
 *
 * Response: { count: number } on success, 500 on upstream failure.
 */

import { NextResponse } from "next/server";
import { syncLegislators } from "@/services/sync";
import { errorMessage } from "@/lib/api-base";

export const maxDuration = 120;

export async function POST() {
  try {
    const count = await syncLegislators();
    return NextResponse.json({ ok: true, count }, { status: 200 });
  } catch (err) {
    console.error("[setup/sync-legislators] failed:", err);
    return NextResponse.json(
      { error: { code: "mcp_failed", message: errorMessage(err) } },
      { status: 500 },
    );
  }
}
