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

/**
 * Stub scorer — assigns score 3 to everything, no real LLM calls.
 * Lets the pipeline run end-to-end in dev without a Gemini key.
 */
export function getStubBillScorer(): BillScorer {
  return {
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
      const contentHtml = `
        <div class="stub-briefing">
          <h1>${input.industryName} 일일 인텔리전스</h1>
          <p>${input.date}</p>
          <p>[STUB] Gemini 브리핑 생성기는 Lane B에서 구현됩니다.</p>
          <p>현재 핵심 법안 ${input.keyBills.length}건, 신규 발의 ${input.newBills.length}건.</p>
        </div>
      `.trim();

      await db
        .insert(dailyBriefing)
        .values({
          date: input.date,
          contentHtml,
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
        keyItemCount: input.keyBills.length,
        scheduleCount: input.scheduleItems.length,
        newBillCount: input.newBills.length,
      };
    },
  };
}
