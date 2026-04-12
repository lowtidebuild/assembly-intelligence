/**
 * Gemini client — real implementation of BillScorer and
 * BriefingGenerator contracts from src/services/sync.ts.
 *
 * ── Models ────────────────────────────────────────────────
 *   Flash (gemini-2.5-flash)  → scoring + quick summary (~20 calls/morning)
 *   Pro   (gemini-2.5-pro)    → daily briefing + on-demand deep analysis
 *
 * Flash is the workhorse. Pro is reserved for user-visible long-form
 * outputs where quality justifies the 10x cost difference.
 *
 * ── Structured output ────────────────────────────────────
 * For scoring (needs {score, reasoning}), we use Gemini's native
 * JSON schema mode (`responseMimeType: "application/json"` +
 * `responseSchema`). This eliminates parsing errors from freeform
 * prose and lets zod do the final type narrowing.
 *
 * ── Rate limiting ────────────────────────────────────────
 * p-limit(3) on the Gemini API — higher than MCP's limit(1) because
 * Google's endpoint is actually stable. Morning sync with 5-20 bills
 * × ~2s per Flash call ≈ 10-15s serialized, 5-8s at concurrency 3.
 *
 * ── Error handling ───────────────────────────────────────
 * Reuses withRetry() from api-base. Non-retryable errors (API key
 * invalid, quota exceeded) wrap as NonRetryableError so the orchestrator
 * can short-circuit the sync instead of blowing retry budget.
 */

import { GoogleGenAI, Type, type Schema } from "@google/genai";
import pLimit from "p-limit";
import { z } from "zod";
import { db, dailyBriefing } from "@/db";
import {
  withRetry,
  NonRetryableError,
  errorMessage,
} from "@/lib/api-base";
import type {
  BillScorer,
  BriefingGenerator,
} from "@/services/sync";
import { buildRelevanceScoringPrompt } from "@/lib/prompts/relevance-scoring";
import { buildBillSummaryPrompt } from "@/lib/prompts/bill-summary";
import { buildDailyBriefingPrompt } from "@/lib/prompts/daily-briefing";
import { buildCompanyImpactPrompt } from "@/lib/prompts/company-impact";
import {
  buildBillAnalysisPrompt,
  type BillAnalysisInput,
} from "@/lib/prompts/bill-analysis";

export type { RelevanceScoringInput } from "@/lib/prompts/relevance-scoring";
export type { BillSummaryInput } from "@/lib/prompts/bill-summary";
export type { BillAnalysisInput } from "@/lib/prompts/bill-analysis";
export type { CompanyImpactInput } from "@/lib/prompts/company-impact";

/* ─────────────────────────────────────────────────────────────
 * Model IDs — single source of truth.
 * ────────────────────────────────────────────────────────────── */

const MODEL_FLASH = "gemini-2.5-flash";
const MODEL_PRO = "gemini-3.1-pro-preview";

/** Max 3 concurrent Gemini calls. */
const limit = pLimit(3);

/* ─────────────────────────────────────────────────────────────
 * Shared singleton client (lazy)
 * ────────────────────────────────────────────────────────────── */

let sharedAi: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (sharedAi) return sharedAi;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new NonRetryableError("GEMINI_API_KEY is not set in .env.local");
  }
  sharedAi = new GoogleGenAI({ apiKey });
  return sharedAi;
}

/* ─────────────────────────────────────────────────────────────
 * Internal call wrapper — adds rate-limit, retry, error narrowing
 * ────────────────────────────────────────────────────────────── */

interface CallOptions {
  model: string;
  prompt: string;
  jsonSchema?: Schema;
  maxOutputTokens?: number;
  temperature?: number;
  operation: string;
  /**
   * Thinking token budget.
   *
   *   gemini-2.5-flash → thinking is OPTIONAL, and enabled by default.
   *     It counts against maxOutputTokens, so for our instruction-
   *     following prompts we force it off by passing 0.
   *
   *   gemini-2.5-pro → thinking is MANDATORY. Passing 0 returns
   *     `Budget 0 is invalid. This model only works in thinking mode.`
   *     Default to `-1` (dynamic — model decides how many thought
   *     tokens it needs) for Pro calls.
   *
   * If you don't pass this, we pick the right default per model.
   */
  thinkingBudget?: number;
}

/** Choose a safe thinking budget default based on model ID. */
function defaultThinkingBudget(model: string): number {
  if (model.includes("pro")) return -1; // dynamic
  return 0; // Flash: off
}

/**
 * Call Gemini with retries + rate limiting. Returns the raw text.
 *
 * If jsonSchema is provided, `responseMimeType: "application/json"`
 * is set so the model output conforms to the schema.
 */
async function callGemini(opts: CallOptions): Promise<string> {
  return limit(() =>
    withRetry(
      async () => {
        const ai = getAi();
        try {
          // `responseSchema` uses the Gemini SDK's own Type enum
          // (not JSON schema strings), hence the cast.
          const response = await ai.models.generateContent({
            model: opts.model,
            contents: opts.prompt,
            config: {
              temperature: opts.temperature ?? 0.3,
              maxOutputTokens: opts.maxOutputTokens ?? 2048,
              thinkingConfig: {
                thinkingBudget:
                  opts.thinkingBudget ?? defaultThinkingBudget(opts.model),
              },
              ...(opts.jsonSchema
                ? {
                    responseMimeType: "application/json",
                    responseSchema: opts.jsonSchema,
                  }
                : {}),
            },
          });
          const text = response.text ?? "";
          if (!text) {
            throw new Error("Gemini returned empty text");
          }
          return text;
        } catch (err) {
          const msg = errorMessage(err);
          // Auth / quota errors are not retryable.
          if (
            /API key not valid|PERMISSION_DENIED|RESOURCE_EXHAUSTED|quota/i.test(
              msg,
            )
          ) {
            throw new NonRetryableError(`Gemini: ${msg}`);
          }
          throw err;
        }
      },
      {
        operation: opts.operation,
        maxAttempts: 3,
        baseDelayMs: 1500,
      },
    ),
  );
}

/* ─────────────────────────────────────────────────────────────
 * Zod schemas for structured outputs
 * ────────────────────────────────────────────────────────────── */

const scoringResultSchema = z.object({
  score: z.number().int().min(1).max(5),
  reasoning: z.string().min(1),
});
export type ScoringResult = z.infer<typeof scoringResultSchema>;

const billAnalysisSchema = z.object({
  executive_summary: z.string(),
  key_provisions: z.array(z.string()),
  impact_analysis: z.object({
    operational: z.string(),
    financial: z.string(),
    compliance: z.string(),
  }),
  passage_likelihood: z.object({
    assessment: z.string(),
    reasoning: z.string(),
  }),
  recommended_actions: z.array(z.string()),
});
export type BillAnalysisResult = z.infer<typeof billAnalysisSchema>;

/* ─────────────────────────────────────────────────────────────
 * BillScorer implementation
 * ────────────────────────────────────────────────────────────── */

/**
 * Gemini-backed BillScorer. Scores relevance 1-5 and generates a
 * 2-3 sentence Korean summary. Stateless — industry context flows
 * through the scoreBill input.
 */
export function getGeminiBillScorer(): BillScorer {
  return {
    async scoreBill(input) {
      const prompt = buildRelevanceScoringPrompt({
        billName: input.billName,
        committee: input.committee,
        proposerName: input.proposerName,
        proposerParty: input.proposerParty,
        proposalReason: input.proposalReason,
        mainContent: input.mainContent,
        industryName: input.industryName,
        industryContext: input.industryContext,
        industryKeywords: input.industryKeywords,
      });

      const raw = await callGemini({
        model: MODEL_FLASH,
        prompt,
        jsonSchema: {
          type: Type.OBJECT,
          properties: {
            score: {
              type: Type.INTEGER,
              description: "Relevance score 1-5",
            },
            reasoning: {
              type: Type.STRING,
              description: "Korean 2-3 sentence explanation",
            },
          },
          required: ["score", "reasoning"],
        },
        temperature: 0.2,
        maxOutputTokens: 512,
        operation: "gemini.scoreBill",
      });

      const parsed = scoringResultSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(
          `Gemini scoring returned invalid shape: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },

    async summarizeBill(input) {
      const prompt = buildBillSummaryPrompt({
        billName: input.billName,
        committee: input.committee,
        proposerName: input.proposerName,
        proposalReason: input.proposalReason,
        mainContent: input.mainContent,
      });

      const raw = await callGemini({
        model: MODEL_FLASH,
        prompt,
        temperature: 0.4,
        maxOutputTokens: 400,
        operation: "gemini.summarizeBill",
      });

      return raw.trim();
    },
  };
}

/* ─────────────────────────────────────────────────────────────
 * BriefingGenerator implementation
 * ────────────────────────────────────────────────────────────── */

/**
 * Gemini-backed BriefingGenerator. Uses Pro model for the daily
 * briefing since this is the user-facing morning read.
 */
export function getGeminiBriefingGenerator(): BriefingGenerator {
  return {
    async generateBriefing(input) {
      const prompt = buildDailyBriefingPrompt(input);

      const rawHtml = await callGemini({
        model: MODEL_PRO,
        prompt,
        temperature: 0.4,
        // Pro dynamic thinking can consume several thousand tokens
        // before emitting any HTML. Budget enough for both.
        maxOutputTokens: 16384,
        operation: "gemini.generateBriefing",
      });

      // Model sometimes wraps output in ```html ... ``` — strip fences.
      const contentHtml = rawHtml
        .trim()
        .replace(/^```html\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      // Persist (same behavior as the stub — sync orchestrator
      // expects the generator to own the daily_briefing row).
      await db
        .insert(dailyBriefing)
        .values({
          date: input.date,
          contentHtml,
          keyItemCount: input.keyBills.length,
          scheduleCount: input.scheduleItems.length,
          newBillCount: input.newBills.length,
        })
        .onConflictDoUpdate({
          target: dailyBriefing.date,
          set: {
            contentHtml,
            keyItemCount: input.keyBills.length,
            scheduleCount: input.scheduleItems.length,
            newBillCount: input.newBills.length,
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

/* ─────────────────────────────────────────────────────────────
 * On-demand endpoints (not used by sync)
 * ────────────────────────────────────────────────────────────── */

/**
 * Generate a "당사 영향 사항" draft for a bill. Called from
 * POST /api/bills/[id]/generate-impact.
 */
export async function generateCompanyImpact(input: {
  billName: string;
  committee: string | null;
  proposerName: string;
  proposerParty: string | null;
  proposalReason: string | null;
  mainContent: string | null;
  industryName: string;
  industryContext: string;
  companyContext?: string;
}): Promise<string> {
  const prompt = buildCompanyImpactPrompt(input);
  const raw = await callGemini({
    model: MODEL_PRO,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 8192,
    operation: "gemini.generateCompanyImpact",
  });
  return raw.trim();
}

/**
 * Generate a deep bill analysis for the 법안 영향 분석기 page.
 */
export async function generateBillAnalysis(
  input: BillAnalysisInput,
): Promise<BillAnalysisResult> {
  const prompt = buildBillAnalysisPrompt(input);
  const raw = await callGemini({
    model: MODEL_PRO,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 16384,
    operation: "gemini.generateBillAnalysis",
  });

  // Pro model is less reliable about following format-only rules, so
  // strip ``` fences defensively.
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = billAnalysisSchema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) {
    throw new Error(
      `Gemini analysis returned invalid shape: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
