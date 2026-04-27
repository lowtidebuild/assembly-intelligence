/**
 * Gemini stub implementation.
 *
 * This is a PLACEHOLDER used by the sync cron endpoints until
 * Lane B (src/lib/gemini-client.ts) is implemented. It satisfies
 * the BillScorer and BriefingGenerator contracts so the rest of
 * the pipeline can be wired up and tested.
 *
 * When Lane B ships, replace the import sites:
 *   import { getStubBillScorer } from "@/lib/gemini-stub";
 *   → import { getGeminiBillScorer } from "@/lib/gemini-client";
 *
 * grep for `gemini-stub` to find call sites.
 */

import { db, dailyBriefing } from "@/db";
import type {
  BillScorer,
  BriefingGenerator,
} from "@/services/sync";
import {
  buildFallbackDailyBriefingContent,
  renderDailyBriefingContentHtml,
} from "@/lib/daily-briefing-content";

/**
 * Stub scorer — assigns score 3 to everything, no real LLM calls.
 * Lets the pipeline run end-to-end in dev without a Gemini key.
 */
export function getStubBillScorer(): BillScorer {
  return {
    async analyzeBillQuick(input) {
      const firstLine = (input.proposalReason || input.mainContent || "")
        .split("\n")[0]
        .slice(0, 200);
      return {
        score: 3,
        reasoning: `[STUB] No Gemini call made. Title: ${input.billName}`,
        summary: `[STUB 요약] ${firstLine}`,
        analysisKeywords: input.industryKeywords.slice(0, 3),
        confidence: "low",
        unknowns:
          input.proposalReason || input.mainContent
            ? []
            : ["제안이유 및 주요내용 미확보"],
      };
    },
    async scoreBill(input) {
      return {
        score: 3, // Medium relevance default — enough to surface in UI
        reasoning: `[STUB] No Gemini call made. Title: ${input.billName}`,
      };
    },
    async summarizeBill(input) {
      const firstLine = (input.proposalReason || input.mainContent || "")
        .split("\n")[0]
        .slice(0, 200);
      return `[STUB 요약] ${firstLine}`;
    },
  };
}

/**
 * Stub briefing generator — writes a minimal HTML dump.
 */
export function getStubBriefingGenerator(): BriefingGenerator {
  return {
    async generateBriefing(input) {
      const contentJson = buildFallbackDailyBriefingContent(input);
      const contentHtml = renderDailyBriefingContentHtml(contentJson);

      await db
        .insert(dailyBriefing)
        .values({
          date: input.date,
          contentHtml,
          contentJson,
          keyItemCount: input.keyBills.length,
          scheduleCount: input.scheduleItems.length,
          newBillCount: input.newBills.length,
          keyBillIds: input.keyBills.map((bill) => bill.id),
          newBillIds: input.newBills.map((bill) => bill.id),
        })
        .onConflictDoUpdate({
          target: dailyBriefing.date,
          set: {
            contentHtml,
            contentJson,
            keyItemCount: input.keyBills.length,
            scheduleCount: input.scheduleItems.length,
            newBillCount: input.newBills.length,
            keyBillIds: input.keyBills.map((bill) => bill.id),
            newBillIds: input.newBills.map((bill) => bill.id),
            generatedAt: new Date(),
          },
        });

      return {
        contentHtml,
        contentJson,
        keyItemCount: input.keyBills.length,
        scheduleCount: input.scheduleItems.length,
        newBillCount: input.newBills.length,
      };
    },
  };
}
