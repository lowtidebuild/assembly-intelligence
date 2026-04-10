/**
 * POST /api/bills/[id]/generate-impact
 *
 * Generates an AI-drafted "당사 영향 사항" for the bill and persists
 * it to bill.companyImpact with companyImpactIsAiDraft = true.
 *
 * Uses Gemini Pro via generateCompanyImpact() in gemini-client.ts.
 * Slow (10-30s) because Pro uses dynamic thinking mode.
 *
 * Body: none
 * Response 200: { companyImpact, isAiDraft: true }
 * Response 4xx: { error: { code, message } }
 *
 * If the user has already edited companyImpact manually
 * (isAiDraft=false), we overwrite with the new draft and flip the
 * flag — the client should confirm first.
 */

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { bill } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateCompanyImpact } from "@/lib/gemini-client";
import {
  requireBillAndProfile,
  isErrorResponse,
  errorResponse,
} from "@/lib/bill-api-helpers";
import { errorMessage } from "@/lib/api-base";

// Gemini Pro + deep thinking can exceed 30s in worst cases.
// Hobby plan maxDuration is 10s — upgrade to Pro for this route.
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const loaded = await requireBillAndProfile(id);
  if (isErrorResponse(loaded)) return loaded;
  const { bill: b, profile } = loaded;

  try {
    const draft = await generateCompanyImpact({
      billName: b.billName,
      committee: b.committee,
      proposerName: b.proposerName,
      proposerParty: b.proposerParty,
      proposalReason: b.proposalReason,
      mainContent: b.mainContent,
      industryName: profile.name,
      industryContext: profile.llmContext,
    });

    await db
      .update(bill)
      .set({
        companyImpact: draft,
        companyImpactIsAiDraft: true,
      })
      .where(eq(bill.id, b.id));

    return NextResponse.json(
      {
        companyImpact: draft,
        isAiDraft: true,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(`[generate-impact] bill ${b.id}:`, err);
    return errorResponse(500, "gemini_error", errorMessage(err));
  }
}
