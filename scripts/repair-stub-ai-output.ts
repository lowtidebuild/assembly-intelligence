import { config } from "dotenv";
config({ path: ".env.local" });

type RepairMode = "reanalyze" | "clear";

interface Args {
  apply: boolean;
  mode: RepairMode;
  limit: number | null;
  billId: number | null;
  date: string | null;
}

const STUB_PREFIX_PATTERN = "[STUB%";
const STUB_CONTAINS_PATTERN = "%[STUB%";

function log(message: string) {
  console.log(`[repair-stub-ai-output] ${message}`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    mode: "reanalyze",
    limit: null,
    billId: null,
    date: null,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--mode=")) {
      const mode = arg.slice("--mode=".length);
      if (mode !== "reanalyze" && mode !== "clear") {
        throw new Error(`Invalid --mode=${mode}. Use reanalyze or clear.`);
      }
      args.mode = mode;
    } else if (arg.startsWith("--limit=")) {
      const limit = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(`Invalid --limit=${arg}. Use a positive integer.`);
      }
      args.limit = limit;
    } else if (arg.startsWith("--bill-id=")) {
      const billId = Number.parseInt(arg.slice("--bill-id=".length), 10);
      if (!Number.isInteger(billId) || billId <= 0) {
        throw new Error(`Invalid --bill-id=${arg}. Use a positive integer.`);
      }
      args.billId = billId;
    } else if (arg.startsWith("--date=")) {
      const date = arg.slice("--date=".length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid --date=${date}. Use YYYY-MM-DD.`);
      }
      args.date = date;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  pnpm tsx scripts/repair-stub-ai-output.ts
  pnpm tsx scripts/repair-stub-ai-output.ts --apply --mode=reanalyze
  pnpm tsx scripts/repair-stub-ai-output.ts --apply --mode=clear --limit=20

Options:
  --apply           Write updates to the configured DATABASE_URL.
  --mode=reanalyze  Replace stub fields using real Gemini quick analysis. Default.
  --mode=clear      Clear stub fields without calling Gemini.
  --limit=N         Process at most N affected bills.
  --bill-id=N       Process one bill row id.
  --date=YYYY-MM-DD Process one daily briefing date.
`);
}

function getDatabaseUrl(): string {
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
  }
  return databaseUrl;
}

function describeDatabase(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "") || "(no-db-name)";
    return `${parsed.hostname}/${database}`;
  } catch {
    return "(unparseable database url)";
  }
}

function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function assertApplyAllowed(args: Args, databaseUrl: string) {
  if (!args.apply) return;

  const remoteDb = !isLocalDatabase(databaseUrl);
  if ((remoteDb || isProductionRuntime()) && process.env.CONFIRM_PROD_REPAIR !== "1") {
    throw new Error(
      [
        "Refusing to modify a remote/production-like database.",
        `database=${describeDatabase(databaseUrl)}`,
        "Re-run with CONFIRM_PROD_REPAIR=1 if this repair is intentional.",
      ].join("\n"),
    );
  }

  if (args.mode === "reanalyze" && !process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("--mode=reanalyze requires GEMINI_API_KEY.");
  }
}

function truncate(value: string | null | undefined, max = 90): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 3))}...`
    : normalized;
}

function formatProposalDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = getDatabaseUrl();
  const databaseLabel = describeDatabase(databaseUrl);

  log(`mode=${args.apply ? "apply" : "dry-run"}`);
  log(`repairMode=${args.mode}`);
  log(`database=${databaseLabel}`);
  if (args.limit) log(`limit=${args.limit}`);
  if (args.billId) log(`billId=${args.billId}`);
  if (args.date) log(`date=${args.date}`);

  const { db } = await import("../src/db");
  const {
    bill,
    dailyBriefing,
    industryProfile,
  } = await import("../src/db/schema");
  const {
    and,
    eq,
    inArray,
    sql,
  } = await import("drizzle-orm");

  const stubBillCondition = sql`
    (
      ${bill.summaryText} ilike ${STUB_PREFIX_PATTERN}
      or ${bill.relevanceReasoning} ilike ${STUB_PREFIX_PATTERN}
      or coalesce(${bill.analysisMeta}::text, '') ilike ${STUB_CONTAINS_PATTERN}
    )
  `;
  const billConditions = [stubBillCondition];
  if (args.billId) {
    billConditions.push(eq(bill.id, args.billId));
  }

  const affectedBillRows = await db
    .select({
      id: bill.id,
      billId: bill.billId,
      billName: bill.billName,
      proposerName: bill.proposerName,
      proposerParty: bill.proposerParty,
      committee: bill.committee,
      proposalDate: bill.proposalDate,
      proposalReason: bill.proposalReason,
      mainContent: bill.mainContent,
      evidenceMeta: bill.evidenceMeta,
      bodyFetchStatus: bill.bodyFetchStatus,
      analysisMeta: bill.analysisMeta,
      summaryText: bill.summaryText,
      relevanceReasoning: bill.relevanceReasoning,
    })
    .from(bill)
    .where(and(...billConditions))
    .orderBy(bill.id);

  const targetBillRows = args.limit
    ? affectedBillRows.slice(0, args.limit)
    : affectedBillRows;

  const stubBriefingCondition = sql`
    (
      ${dailyBriefing.contentHtml} ilike ${STUB_CONTAINS_PATTERN}
      or coalesce(${dailyBriefing.contentJson}::text, '') ilike ${STUB_CONTAINS_PATTERN}
    )
  `;
  const briefingConditions = [stubBriefingCondition];
  if (args.date) {
    briefingConditions.push(eq(dailyBriefing.date, args.date));
  }

  const affectedBriefingRows = args.billId
    ? []
    : await db
        .select({
          id: dailyBriefing.id,
          date: dailyBriefing.date,
          keyBillIds: dailyBriefing.keyBillIds,
          newBillIds: dailyBriefing.newBillIds,
          keyItemCount: dailyBriefing.keyItemCount,
          newBillCount: dailyBriefing.newBillCount,
        })
        .from(dailyBriefing)
        .where(and(...briefingConditions))
        .orderBy(dailyBriefing.date);

  log(`affectedBills=${affectedBillRows.length}`);
  log(`targetBills=${targetBillRows.length}`);
  log(`affectedBriefings=${affectedBriefingRows.length}`);

  for (const row of targetBillRows.slice(0, 10)) {
    log(
      `bill sample id=${row.id} title="${truncate(row.billName)}" summary="${truncate(row.summaryText, 60)}" reasoning="${truncate(row.relevanceReasoning, 60)}"`,
    );
  }
  for (const row of affectedBriefingRows.slice(0, 5)) {
    log(
      `briefing sample date=${row.date} keyItems=${row.keyItemCount} newBills=${row.newBillCount}`,
    );
  }

  if (!args.apply) {
    log("dry-run only. Re-run with --apply to update rows.");
    return;
  }

  assertApplyAllowed(args, databaseUrl);

  const [profile] = await db.select().from(industryProfile).limit(1);
  if (!profile) {
    throw new Error("No industry profile found.");
  }

  const { mergeKeywordsWithMixins } = await import("../src/lib/law-mixins");
  const { QUICK_ANALYSIS_PROMPT_VERSION } = await import(
    "../src/lib/prompts/bill-quick-analysis"
  );
  const { buildEvidenceMeta } = await import("../src/lib/evidence");
  const now = new Date().toISOString();
  const industryKeywords = mergeKeywordsWithMixins(
    profile.keywords ?? [],
    profile.selectedLawMixins ?? [],
  );

  let updatedBills = 0;

  if (args.mode === "reanalyze") {
    const { getGeminiBillScorer } = await import("../src/lib/gemini-client");
    const scorer = getGeminiBillScorer();

    for (const row of targetBillRows) {
      const evidence =
        row.evidenceMeta ??
        buildEvidenceMeta({
          billName: row.billName,
          committee: row.committee,
          proposerName: row.proposerName,
          proposerParty: row.proposerParty,
          proposalDate: formatProposalDate(row.proposalDate),
          proposalReason: row.proposalReason,
          mainContent: row.mainContent,
          bodyFetchStatus: row.bodyFetchStatus ?? "not_attempted",
        });
      const analysis = await scorer.analyzeBillQuick({
        billName: row.billName,
        committee: row.committee,
        proposerName: row.proposerName,
        proposerParty: row.proposerParty,
        proposalReason: row.proposalReason,
        mainContent: row.mainContent,
        industryName: profile.name,
        industryContext: profile.llmContext,
        industryKeywords,
        evidence,
      });

      await db
        .update(bill)
        .set({
          relevanceScore: analysis.score,
          relevanceReasoning: analysis.reasoning,
          summaryText: analysis.summary,
          analysisMeta: {
            ...(row.analysisMeta ?? {}),
            analysisKeywords: analysis.analysisKeywords,
            confidence: analysis.confidence,
            unknowns: analysis.unknowns,
            quickAnalysisVersion: QUICK_ANALYSIS_PROMPT_VERSION,
            analyzedAt: now,
            aiMode: "gemini",
            repairedAt: now,
            repairReason: "stub_output_remediation",
          },
          lastSynced: new Date(),
        })
        .where(eq(bill.id, row.id));
      updatedBills += 1;
      log(`reanalyzed bill id=${row.id} score=${analysis.score}`);
    }
  } else {
    for (const row of targetBillRows) {
      await db
        .update(bill)
        .set({
          relevanceScore: null,
          relevanceReasoning: null,
          summaryText: null,
          analysisMeta: {
            analysisKeywords: [],
            confidence: "low",
            unknowns: uniqueStrings([
              ...(row.analysisMeta?.unknowns ?? []),
              "이전 테스트 분석 결과 제거됨; 다음 실제 sync에서 재분석 필요",
            ]),
            quickAnalysisVersion: QUICK_ANALYSIS_PROMPT_VERSION,
            analyzedAt: now,
            repairedAt: now,
            repairReason: "stub_output_cleared",
          },
          lastSynced: new Date(),
        })
        .where(eq(bill.id, row.id));
      updatedBills += 1;
      log(`cleared bill id=${row.id}`);
    }
  }

  log(`updatedBills=${updatedBills}`);

  let updatedBriefings = 0;
  for (const row of affectedBriefingRows) {
    const briefingBillIds = uniqueStrings([
      ...row.keyBillIds.map(String),
      ...row.newBillIds.map(String),
    ]).map((id) => Number.parseInt(id, 10));
    const briefingBills =
      briefingBillIds.length > 0
        ? await db
            .select({
              id: bill.id,
              billName: bill.billName,
              proposerName: bill.proposerName,
              proposerParty: bill.proposerParty,
              committee: bill.committee,
              summaryText: bill.summaryText,
              relevanceReasoning: bill.relevanceReasoning,
            })
            .from(bill)
            .where(inArray(bill.id, briefingBillIds))
        : [];
    const billById = new Map(briefingBills.map((entry) => [entry.id, entry]));
    const keyBills = row.keyBillIds
      .map((id) => billById.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const newBills = row.newBillIds
      .map((id) => billById.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (args.mode === "reanalyze") {
      const { getGeminiBriefingGenerator } = await import(
        "../src/lib/gemini-client"
      );
      const generator = getGeminiBriefingGenerator();
      try {
        await generator.generateBriefing({
          date: row.date,
          industryName: profile.name,
          keyBills,
          scheduleItems: [],
          newBills,
        });
      } catch (error) {
        log(
          `briefing date=${row.date} Gemini regeneration failed; writing deterministic fallback. error=${errorMessage(error)}`,
        );
        const {
          buildFallbackDailyBriefingContent,
          renderDailyBriefingContentHtml,
        } = await import("../src/lib/daily-briefing-content");
        const contentJson = buildFallbackDailyBriefingContent({
          date: row.date,
          industryName: profile.name,
          keyBills,
          scheduleItems: [],
          newBills,
        });
        const contentHtml = renderDailyBriefingContentHtml(contentJson);
        await db
          .update(dailyBriefing)
          .set({
            contentHtml,
            contentJson,
            keyItemCount: keyBills.length,
            scheduleCount: 0,
            newBillCount: newBills.length,
            generatedAt: new Date(),
          })
          .where(eq(dailyBriefing.id, row.id));
      }
    } else {
      const {
        buildFallbackDailyBriefingContent,
        renderDailyBriefingContentHtml,
      } = await import("../src/lib/daily-briefing-content");
      const contentJson = buildFallbackDailyBriefingContent({
        date: row.date,
        industryName: profile.name,
        keyBills,
        scheduleItems: [],
        newBills,
      });
      const contentHtml = renderDailyBriefingContentHtml(contentJson);
      await db
        .update(dailyBriefing)
        .set({
          contentHtml,
          contentJson,
          keyItemCount: keyBills.length,
          scheduleCount: 0,
          newBillCount: newBills.length,
          generatedAt: new Date(),
        })
        .where(eq(dailyBriefing.id, row.id));
    }

    updatedBriefings += 1;
    log(`repaired briefing date=${row.date}`);
  }

  log(`updatedBriefings=${updatedBriefings}`);

  const remainingBills = await db
    .select({ id: bill.id })
    .from(bill)
    .where(stubBillCondition);
  const remainingBriefings = await db
    .select({ id: dailyBriefing.id })
    .from(dailyBriefing)
    .where(stubBriefingCondition);

  log(`remainingStubBills=${remainingBills.length}`);
  log(`remainingStubBriefings=${remainingBriefings.length}`);
}

main().catch((error) => {
  console.error("[repair-stub-ai-output] failed", error);
  process.exitCode = 1;
});
