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
 * (isAiDraft=false), the default behavior is 409 Conflict. The client
 * must explicitly retry with ?force=1 after user confirmation.
 */

import { NextResponse, type NextRequest } from "next/server";
import { demoGuardResponse } from "@/lib/demo-mode";
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
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = demoGuardResponse();
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const loaded = await requireBillAndProfile(id);
  if (isErrorResponse(loaded)) return loaded;
  const { bill: b, profile } = loaded;
  const forceOverwrite = req.nextUrl.searchParams.get("force") === "1";

  if (b.companyImpact?.trim() && !b.companyImpactIsAiDraft && !forceOverwrite) {
    return errorResponse(
      409,
      "manual_impact_exists",
      "이미 사람이 편집한 당사 영향 사항이 있습니다. 덮어쓰려면 확인 후 다시 요청하세요.",
    );
  }

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
      evidence: b.evidenceMeta ?? undefined,
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
