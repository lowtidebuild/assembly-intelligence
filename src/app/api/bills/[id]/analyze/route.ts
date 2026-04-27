/**
 * POST /api/bills/[id]/analyze
 *
 * Generates a Gemini Pro 5-section deep analysis for the bill and
 * persists it to bill.deep_analysis (jsonb) + deep_analysis_generated_at.
 *
 * The shape comes from buildBillAnalysisPrompt() in prompts/bill-analysis.ts.
 * Schema validated by billAnalysisSchema in gemini-client.ts.
 *
 * Body: none
 * Response 200: { analysis: BillAnalysisResult, generatedAt: string (ISO) }
 * Response 4xx: { error: { code, message } }
 *
 * Slow (20-40s) — Pro + dynamic thinking + longer prompt than the
 * company-impact endpoint. Pro plan required (60s maxDuration).
 */

import { NextResponse, type NextRequest } from "next/server";
import { demoGuardResponse } from "@/lib/demo-mode";
import { db } from "@/db";
import { bill } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateBillAnalysis } from "@/lib/gemini-client";
import {
  flattenBillReferenceSections,
  loadBillReferenceSections,
} from "@/lib/mcp-references";
import {
  buildEvidenceMeta,
  withReferenceEvidence,
} from "@/lib/evidence";
import {
  requireBillAndProfile,
  isErrorResponse,
  errorResponse,
} from "@/lib/bill-api-helpers";
import { errorMessage } from "@/lib/api-base";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = demoGuardResponse();
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const loaded = await requireBillAndProfile(id);
  if (isErrorResponse(loaded)) return loaded;
  const { bill: b, profile } = loaded;

  try {
    const referenceSections = await loadBillReferenceSections(b.billName);
    const references = flattenBillReferenceSections(referenceSections, 5);
    const baseEvidence =
      b.evidenceMeta ??
      buildEvidenceMeta({
        billName: b.billName,
        committee: b.committee,
        proposerName: b.proposerName,
        proposerParty: b.proposerParty,
        proposalDate: b.proposalDate
          ? b.proposalDate.toISOString().slice(0, 10)
          : null,
        proposalReason: b.proposalReason,
        mainContent: b.mainContent,
      });
    const analysisEvidence = withReferenceEvidence(
      baseEvidence,
      references.length,
    );

    const analysis = await generateBillAnalysis({
      billName: b.billName,
      committee: b.committee,
      proposerName: b.proposerName,
      proposerParty: b.proposerParty,
      coSponsorCount: b.coSponsorCount,
      proposalDate: b.proposalDate
        ? b.proposalDate.toISOString().slice(0, 10)
        : null,
      stage: b.stage,
      proposalReason: b.proposalReason,
      mainContent: b.mainContent,
      industryName: profile.name,
      industryContext: profile.llmContext,
      evidence: analysisEvidence,
      references,
    });

    const generatedAt = new Date();
    await db
      .update(bill)
      .set({
        deepAnalysis: analysis,
        deepAnalysisGeneratedAt: generatedAt,
        evidenceLevel: analysisEvidence.level,
        bodyFetchStatus: analysisEvidence.bodyFetchStatus,
        evidenceMeta: analysisEvidence,
      })
      .where(eq(bill.id, b.id));

    return NextResponse.json(
      {
        analysis,
        generatedAt: generatedAt.toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(`[analyze] bill ${b.id}:`, err);
    return errorResponse(500, "gemini_error", errorMessage(err));
  }
}
