import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { bill } from "../src/db/schema";
import {
  buildRuleBasedAmendmentDelta,
  coerceAmendmentDelta,
  hasUsefulAmendmentDelta,
} from "../src/lib/amendment-delta";
import { QUICK_ANALYSIS_PROMPT_VERSION } from "../src/lib/prompts/bill-quick-analysis";
import type { BillAnalysisMeta } from "../src/lib/sync-health";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = args.includes("--force");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.replace("--limit=", "")) : null;

function log(message: string) {
  console.log(`[backfill-amendment-delta] ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildNextMeta(
  existing: unknown,
  delta: NonNullable<ReturnType<typeof buildRuleBasedAmendmentDelta>>,
): BillAnalysisMeta {
  const base = isRecord(existing) ? existing : {};
  const now = new Date().toISOString();

  return {
    ...base,
    analysisKeywords: Array.isArray(base.analysisKeywords)
      ? base.analysisKeywords.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    confidence:
      base.confidence === "low" ||
      base.confidence === "medium" ||
      base.confidence === "high"
        ? base.confidence
        : delta.confidence,
    unknowns: Array.isArray(base.unknowns)
      ? base.unknowns.filter((item): item is string => typeof item === "string")
      : delta.unknowns,
    quickAnalysisVersion:
      typeof base.quickAnalysisVersion === "string"
        ? base.quickAnalysisVersion
        : QUICK_ANALYSIS_PROMPT_VERSION,
    analyzedAt: typeof base.analyzedAt === "string" ? base.analyzedAt : now,
    amendmentDelta: delta,
    repairedAt: now,
    repairReason: force
      ? "amendment_delta_backfill_force_v1"
      : "amendment_delta_backfill_v1",
  };
}

async function main() {
  const { db } = await import("../src/db");
  const rows = await db
    .select({
      id: bill.id,
      billId: bill.billId,
      billName: bill.billName,
      proposalReason: bill.proposalReason,
      mainContent: bill.mainContent,
      analysisMeta: bill.analysisMeta,
    })
    .from(bill);

  const candidates = rows
    .filter((row) => row.proposalReason || row.mainContent)
    .filter((row) => {
      if (force) return true;
      return !hasUsefulAmendmentDelta(
        coerceAmendmentDelta(row.analysisMeta?.amendmentDelta),
      );
    });
  const selected =
    limit && Number.isFinite(limit) && limit > 0
      ? candidates.slice(0, limit)
      : candidates;

  const updates = selected
    .map((row) => ({
      row,
      delta: buildRuleBasedAmendmentDelta({
        billName: row.billName,
        proposalReason: row.proposalReason,
        mainContent: row.mainContent,
      }),
    }))
    .filter(
      (
        item,
      ): item is {
        row: (typeof selected)[number];
        delta: NonNullable<ReturnType<typeof buildRuleBasedAmendmentDelta>>;
      } => hasUsefulAmendmentDelta(item.delta),
    );

  log(`mode=${apply ? "apply" : "dry-run"}`);
  log(`force=${force ? "yes" : "no"}`);
  log(`rows=${rows.length}, candidates=${candidates.length}, updates=${updates.length}`);
  log(
    `sample=${
      updates
        .slice(0, 5)
        .map(({ row }) => row.billId)
        .join(", ") || "none"
    }`,
  );

  if (!apply) {
    log("dry-run only. Re-run with --apply to update rows.");
    return;
  }

  for (const { row, delta } of updates) {
    await db
      .update(bill)
      .set({
        analysisMeta: buildNextMeta(row.analysisMeta, delta),
      })
      .where(eq(bill.id, row.id));
  }

  log(`updated=${updates.length}`);
}

main().catch((error) => {
  console.error("[backfill-amendment-delta] failed", error);
  process.exitCode = 1;
});
