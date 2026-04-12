/**
 * PATCH /api/bills/[id]/impact
 *
 * Manually save a user-edited "당사 영향 사항". Clears the AI draft
 * flag — once a human touches the field, it's canonical.
 *
 * Body: { companyImpact: string }  (1-10000 chars)
 * Response 200: { ok: true, companyImpact, isAiDraft: false }
 * Response 4xx: { error: { code, message } }
 *
 * No Gemini call. Fast.
 */

import { NextResponse, type NextRequest } from "next/server";
import { demoGuardResponse } from "@/lib/demo-mode";
import { z } from "zod";
import { db } from "@/db";
import { bill } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  parseBillId,
  errorResponse,
  loadBillAndProfile,
} from "@/lib/bill-api-helpers";

const bodySchema = z.object({
  companyImpact: z.string().min(1, "비어있을 수 없음").max(10000, "10000자 초과"),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = demoGuardResponse();
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const billId = parseBillId(id);
  if (!billId) {
    return errorResponse(400, "invalid_bill_id", `Invalid bill id: ${id}`);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body is not valid JSON");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "validation_error",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  // Existence check — 404 early rather than silently updating nothing.
  const { bill: existing } = await loadBillAndProfile(billId);
  if (!existing) {
    return errorResponse(404, "bill_not_found", `Bill ${billId} not found`);
  }

  await db
    .update(bill)
    .set({
      companyImpact: parsed.data.companyImpact,
      companyImpactIsAiDraft: false,
    })
    .where(eq(bill.id, billId));

  return NextResponse.json(
    {
      ok: true,
      companyImpact: parsed.data.companyImpact,
      isAiDraft: false,
    },
    { status: 200 },
  );
}
