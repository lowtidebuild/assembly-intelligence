/**
 * Shared helpers for the /api/bills/[id]/* routes.
 *
 * All three endpoints (generate-impact, PATCH impact, analyze) need
 * to:
 *   1. Parse and validate the bill id from the URL segment
 *   2. Load the bill + the active industry profile in one Promise.all
 *   3. Return a consistent error shape on failure
 *
 * These helpers centralize that so the routes themselves stay tiny.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { bill, industryProfile, type Bill, type IndustryProfile } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface BillWithProfile {
  bill: Bill;
  profile: IndustryProfile;
}

/**
 * Parse a bill id from a string URL segment. Returns `null` on
 * invalid input (non-numeric, negative, etc).
 */
export function parseBillId(idStr: string): number | null {
  const n = parseInt(idStr, 10);
  if (!Number.isFinite(n) || n <= 0 || String(n) !== idStr.trim()) return null;
  return n;
}

/**
 * Load a bill + the active industry profile.
 * Returns `null` for either if missing (caller decides how to respond).
 */
export async function loadBillAndProfile(
  billId: number,
): Promise<{
  bill: Bill | null;
  profile: IndustryProfile | null;
}> {
  const [billRows, profileRows] = await Promise.all([
    db.select().from(bill).where(eq(bill.id, billId)).limit(1),
    db.select().from(industryProfile).limit(1),
  ]);
  return {
    bill: billRows[0] ?? null,
    profile: profileRows[0] ?? null,
  };
}

/** Standard JSON error response shape. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Guard: require both a valid bill and an active profile.
 * Returns `NextResponse` on failure, or `{ bill, profile }` on success.
 */
export async function requireBillAndProfile(
  billIdStr: string,
): Promise<NextResponse | BillWithProfile> {
  const billId = parseBillId(billIdStr);
  if (!billId) {
    return errorResponse(400, "invalid_bill_id", `Invalid bill id: ${billIdStr}`);
  }
  const { bill, profile } = await loadBillAndProfile(billId);
  if (!bill) {
    return errorResponse(404, "bill_not_found", `Bill ${billId} not found`);
  }
  if (!profile) {
    return errorResponse(
      409,
      "no_active_profile",
      "No industry profile configured — run /setup first",
    );
  }
  return { bill, profile };
}

/** Type guard — is this a NextResponse (error) or the happy shape? */
export function isErrorResponse(
  v: NextResponse | BillWithProfile,
): v is NextResponse {
  return v instanceof NextResponse;
}
