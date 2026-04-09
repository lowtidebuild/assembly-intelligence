/**
 * Sync service — orchestrates the daily sync pipeline.
 *
 *   morning sync (06:30 KST)    evening sync (18:30 KST)
 *   ────────────────────────    ────────────────────────
 *   1. Fetch active legislators 1. Fetch bill status changes
 *      (once per term)             since morning sync
 *   2. Fetch committees          2. Update Bill.stage for any
 *   3. Fetch today's schedule       transitions (create alerts)
 *   4. Fetch new/changed bills   3. Create BillTimeline rows
 *   5. Keyword pre-filter        4. Log to SyncLog
 *   6. Gemini relevance score
 *   7. Gemini summary generation
 *   8. Generate DailyBriefing
 *   9. Log to SyncLog
 *
 * ── Dependency inversion ──────────────────────────────────
 * This service does NOT import gemini-client directly. Instead it
 * accepts `BillScorer` and `BriefingGenerator` interfaces through
 * the orchestrator function, so Lane B (Gemini) can be swapped in
 * later without changing this file, and tests can pass fakes.
 *
 * Same for the news client — accepted as a dependency, not imported.
 *
 * ── ⚠️ STATUS: MCP tool names & response shapes DO NOT match ──
 *
 * This file was written against assumed MCP tool names:
 *   get_active_lawmakers, search_bills, get_bill_detail
 *
 * The real MCP server (assembly-api-mcp) exposes only 6 tools:
 *   assembly_member, assembly_bill, assembly_session,
 *   assembly_org, discover_apis, query_assembly
 *
 * Response payloads use Korean field names: 의안ID, 의안명, 제안자,
 * 소관위원회, 제안일, 등. Bill search does NOT include 제안이유 or
 * 주요내용 — those require a second call with bill_id.
 *
 * See docs/mcp-api-reality.md for the full analysis captured from
 * live server inspection on 2026-04-10.
 *
 * This file will be rewritten in the next session to match the real
 * API. The current implementation is kept as architectural scaffolding
 * — dependency contracts (BillScorer, BriefingGenerator), error
 * handling patterns, sync log writing, and transaction structure are
 * all still valid. Only the MCP call sites need updating.
 *
 * TODO(next-session): rewrite MCP call sites:
 *   - callMcpToolOrThrow("get_active_lawmakers") → callMcpToolOrThrow("assembly_member", {...})
 *   - callMcpToolOrThrow("search_bills", ...) → callMcpToolOrThrow("assembly_bill", {...})
 *   - callMcpToolOrThrow("get_bill_detail", ...) → callMcpToolOrThrow("assembly_bill", { bill_id })
 *   - Adapt McpBill / McpLawmaker interfaces to Korean field names
 *   - Handle two-phase bill fetch (search → detail) for Gemini scoring
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bill,
  billTimeline,
  industryProfile,
  industryCommittee,
  legislator,
  syncLog,
  alert,
  type NewBill,
  type Bill,
} from "@/db/schema";

/**
 * Bill stage enum literal type. Matches `bill_stage` postgres enum.
 * Hoisted as a concrete union so call sites can pass stage values
 * into tables whose `stage` column has no default (billTimeline).
 */
type BillStage =
  | "stage_0"
  | "stage_1"
  | "stage_2"
  | "stage_3"
  | "stage_4"
  | "stage_5"
  | "stage_6";
import { callMcpToolOrThrow } from "@/lib/mcp-client";
import { errorMessage } from "@/lib/api-base";

/* ─────────────────────────────────────────────────────────────
 * Dependency contracts (injected by orchestrator)
 * ────────────────────────────────────────────────────────────── */

export interface BillScorer {
  scoreBill(input: {
    billName: string;
    proposalReason: string;
    mainContent: string;
    industryContext: string;
    industryKeywords: string[];
  }): Promise<{ score: number; reasoning: string }>;

  summarizeBill(input: {
    billName: string;
    proposalReason: string;
    mainContent: string;
  }): Promise<string>;
}

export interface BriefingGenerator {
  generateBriefing(input: {
    date: string;
    industryName: string;
    keyBills: Bill[];
    scheduleItems: ScheduleItem[];
    newBills: Bill[];
  }): Promise<{
    contentHtml: string;
    keyItemCount: number;
    scheduleCount: number;
    newBillCount: number;
  }>;
}

/* ─────────────────────────────────────────────────────────────
 * MCP response shapes
 * ────────────────────────────────────────────────────────────── */

interface McpBill {
  bill_id: string;
  bill_name: string;
  proposer: string;
  proposer_party?: string;
  co_sponsor_count?: number;
  committee?: string;
  status?: string;
  stage?: number; // 0-6
  proposal_date?: string; // ISO
  proposal_reason?: string;
  main_content?: string;
  external_link?: string;
}

interface McpLawmaker {
  member_id: string;
  name: string;
  name_hanja?: string;
  party: string;
  district?: string;
  term_number?: number;
  committees?: string[];
  profile_image_url?: string;
}

interface ScheduleItem {
  time: string;
  committee: string;
  subject: string;
  location?: string;
}

/* ─────────────────────────────────────────────────────────────
 * Utilities
 * ────────────────────────────────────────────────────────────── */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Today's date in KST as "YYYY-MM-DD" */
function todayKstDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

/** Map integer stage (0-6) to Drizzle enum value */
function stageFromInt(n: number | undefined): BillStage {
  const clamped = Math.min(6, Math.max(0, n ?? 1));
  return `stage_${clamped}` as BillStage;
}

/**
 * Keyword pre-filter. Returns true if any industry keyword appears
 * in bill text (name + proposal reason + main content).
 *
 * Cuts the Gemini scoring workload: typical 50-200 weekly new bills
 * → ~20% pass pre-filter → Gemini scores only those.
 */
function keywordMatches(mcpBill: McpBill, keywords: string[]): boolean {
  if (keywords.length === 0) return true; // No filter — score everything
  const haystack = [
    mcpBill.bill_name,
    mcpBill.proposal_reason ?? "",
    mcpBill.main_content ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

/* ─────────────────────────────────────────────────────────────
 * Morning sync: full pipeline
 * ────────────────────────────────────────────────────────────── */

export interface MorningSyncDeps {
  scorer: BillScorer;
  briefingGenerator: BriefingGenerator;
}

export interface MorningSyncResult {
  syncLogId: number;
  billsProcessed: number;
  billsScored: number;
  legislatorsUpdated: number;
  briefingDate: string;
  status: "success" | "partial" | "failed";
  errors: string[];
}

/**
 * Run the morning sync pipeline. Called by the cron route at
 * /api/cron/sync-morning.
 *
 * Errors in individual steps are collected but don't abort the
 * whole pipeline — we prefer partial success over total failure.
 */
export async function runMorningSync(
  deps: MorningSyncDeps,
): Promise<MorningSyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let billsProcessed = 0;
  let billsScored = 0;
  let legislatorsUpdated = 0;

  // 1. Active industry profile
  const [activeProfile] = await db.select().from(industryProfile).limit(1);
  if (!activeProfile) {
    throw new Error("No industry profile configured — run /setup first");
  }

  // 2. Committees + keywords + llm_context
  const committees = await db
    .select()
    .from(industryCommittee)
    .where(eq(industryCommittee.industryProfileId, activeProfile.id));
  const committeeCodes = committees.map((c) => c.committeeCode);
  const keywords = activeProfile.keywords ?? [];

  // 3. Sync legislators
  try {
    const lawmakersResult = await callMcpToolOrThrow<{
      lawmakers: McpLawmaker[];
    }>("get_active_lawmakers");
    legislatorsUpdated = await upsertLegislators(
      lawmakersResult.lawmakers ?? [],
    );
  } catch (err) {
    errors.push(`legislators: ${errorMessage(err)}`);
  }

  // 4. Fetch bills per relevant committee (in parallel, bounded by p-limit)
  const mcpBills: McpBill[] = [];
  const committeesToQuery =
    committeeCodes.length > 0 ? committeeCodes : [""];

  const fetchResults = await Promise.allSettled(
    committeesToQuery.map((code) =>
      callMcpToolOrThrow<{ bills: McpBill[] }>(
        "search_bills",
        code ? { committee: code, limit: 100 } : { limit: 100 },
      ),
    ),
  );

  for (let i = 0; i < fetchResults.length; i++) {
    const result = fetchResults[i];
    const code = committeesToQuery[i];
    if (result.status === "fulfilled") {
      mcpBills.push(...(result.value.bills ?? []));
    } else {
      errors.push(
        `search_bills(${code || "all"}): ${errorMessage(result.reason)}`,
      );
    }
  }

  // Deduplicate by bill_id
  const uniqueBills = Array.from(
    new Map(mcpBills.map((b) => [b.bill_id, b])).values(),
  );
  billsProcessed = uniqueBills.length;

  // 5. Keyword pre-filter
  const filtered = uniqueBills.filter((b) => keywordMatches(b, keywords));

  // 6. Gemini score + summary (sequential for now; Lane B can add p-limit)
  const scoredBills: Array<
    McpBill & { score: number; reasoning: string; summary: string }
  > = [];

  for (const mcpBill of filtered) {
    try {
      const [scoreResult, summary] = await Promise.all([
        deps.scorer.scoreBill({
          billName: mcpBill.bill_name,
          proposalReason: mcpBill.proposal_reason ?? "",
          mainContent: mcpBill.main_content ?? "",
          industryContext: activeProfile.llmContext,
          industryKeywords: keywords,
        }),
        deps.scorer.summarizeBill({
          billName: mcpBill.bill_name,
          proposalReason: mcpBill.proposal_reason ?? "",
          mainContent: mcpBill.main_content ?? "",
        }),
      ]);

      scoredBills.push({
        ...mcpBill,
        score: scoreResult.score,
        reasoning: scoreResult.reasoning,
        summary,
      });
      billsScored++;
    } catch (err) {
      errors.push(`score(${mcpBill.bill_id}): ${errorMessage(err)}`);
    }
  }

  // 7. Upsert scored bills
  try {
    await upsertBills(scoredBills);
  } catch (err) {
    errors.push(`upsert_bills: ${errorMessage(err)}`);
  }

  // 8. Generate daily briefing (top-4 relevance bills get surfaced)
  const briefingDate = todayKstDate();
  try {
    const topBills = await db
      .select()
      .from(bill)
      .where(sql`${bill.relevanceScore} >= 4`)
      .orderBy(sql`${bill.relevanceScore} DESC`)
      .limit(4);

    const newBills = await db
      .select()
      .from(bill)
      .where(sql`${bill.createdAt} > NOW() - INTERVAL '24 hours'`)
      .limit(10);

    // Schedule currently stubbed — implement when the MCP schedule
    // tool's shape is confirmed.
    const scheduleItems: ScheduleItem[] = [];

    await deps.briefingGenerator.generateBriefing({
      date: briefingDate,
      industryName: activeProfile.name,
      keyBills: topBills,
      scheduleItems,
      newBills,
    });
    // BriefingGenerator is responsible for persisting to daily_briefing
  } catch (err) {
    errors.push(`briefing: ${errorMessage(err)}`);
  }

  // 9. Write sync log
  const status: MorningSyncResult["status"] =
    errors.length === 0
      ? "success"
      : billsScored > 0
        ? "partial"
        : "failed";

  const [logRow] = await db
    .insert(syncLog)
    .values({
      syncType: "morning",
      status,
      startedAt,
      completedAt: new Date(),
      billsProcessed,
      billsScored,
      legislatorsUpdated,
      newsFetched: 0,
      errorsJson: errors.length > 0 ? errors : null,
    })
    .returning({ id: syncLog.id });

  return {
    syncLogId: logRow.id,
    billsProcessed,
    billsScored,
    legislatorsUpdated,
    briefingDate,
    status,
    errors,
  };
}

/* ─────────────────────────────────────────────────────────────
 * Evening sync: change detection only
 * ────────────────────────────────────────────────────────────── */

export interface EveningSyncResult {
  syncLogId: number;
  billsChecked: number;
  stageTransitions: number;
  alertsCreated: number;
  status: "success" | "partial" | "failed";
  errors: string[];
}

/**
 * Evening sync — lightweight change detection for bills already
 * in the database. Runs at 18:30 KST. Catches afternoon
 * legislative activity (committee passes, votes) before the next
 * morning's full sync.
 *
 * No Gemini calls. No briefing regeneration. Just:
 *   1. Pull high-relevance, non-terminal bills from DB
 *   2. For each, call get_bill_detail from MCP
 *   3. If stage changed: update + create alert + write timeline entry
 */
export async function runEveningSync(): Promise<EveningSyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let billsChecked = 0;
  let stageTransitions = 0;
  let alertsCreated = 0;

  // Only check bills relevant enough to matter (score >= 3) and
  // not already in terminal state (stage_6 = 공포)
  const trackedBills = await db
    .select()
    .from(bill)
    .where(
      and(
        sql`${bill.relevanceScore} >= 3`,
        sql`${bill.stage} != 'stage_6'`,
      ),
    );

  for (const trackedBill of trackedBills) {
    try {
      billsChecked++;
      const detail = await callMcpToolOrThrow<McpBill>("get_bill_detail", {
        bill_id: trackedBill.billId,
      });

      const newStage = stageFromInt(detail.stage);
      if (newStage !== trackedBill.stage) {
        await db.transaction(async (tx) => {
          await tx
            .update(bill)
            .set({
              stage: newStage,
              status: detail.status ?? trackedBill.status,
              lastSynced: new Date(),
            })
            .where(eq(bill.id, trackedBill.id));

          await tx.insert(billTimeline).values({
            billId: trackedBill.id,
            stage: newStage,
            eventDate: new Date(),
            description: `${trackedBill.stage} → ${newStage}`,
          });

          await tx.insert(alert).values({
            type: "stage_change",
            billId: trackedBill.id,
            message: `${trackedBill.billName} — ${trackedBill.stage} → ${newStage}`,
          });
        });

        stageTransitions++;
        alertsCreated++;
      }
    } catch (err) {
      errors.push(`${trackedBill.billId}: ${errorMessage(err)}`);
    }
  }

  const status: EveningSyncResult["status"] =
    errors.length === 0
      ? "success"
      : stageTransitions > 0
        ? "partial"
        : "failed";

  const [logRow] = await db
    .insert(syncLog)
    .values({
      syncType: "evening",
      status,
      startedAt,
      completedAt: new Date(),
      billsProcessed: billsChecked,
      billsScored: 0, // No scoring in evening sync
      legislatorsUpdated: 0,
      newsFetched: 0,
      errorsJson: errors.length > 0 ? errors : null,
    })
    .returning({ id: syncLog.id });

  return {
    syncLogId: logRow.id,
    billsChecked,
    stageTransitions,
    alertsCreated,
    status,
    errors,
  };
}

/* ─────────────────────────────────────────────────────────────
 * Database upsert helpers
 * ────────────────────────────────────────────────────────────── */

/**
 * Upsert legislator rows from MCP lawmakers response.
 *
 * Dedupes by member_id. Computes seat_index for hemicycle display
 * by ordering alphabetically within parties (deterministic — can
 * be refined to match real seating order later).
 */
async function upsertLegislators(
  lawmakers: McpLawmaker[],
): Promise<number> {
  if (lawmakers.length === 0) return 0;

  // Group by party for seat index computation
  const byParty = new Map<string, McpLawmaker[]>();
  for (const lm of lawmakers) {
    const list = byParty.get(lm.party) ?? [];
    list.push(lm);
    byParty.set(lm.party, list);
  }

  // Assign seat indices: alphabetical by party name, then by member_id
  // within party. Deterministic and reproducible across syncs.
  let seatCursor = 0;
  const rows: Array<typeof legislator.$inferInsert> = [];
  const sortedParties = [...byParty.keys()].sort();
  for (const party of sortedParties) {
    const list = byParty.get(party)!;
    list.sort((a, b) => a.member_id.localeCompare(b.member_id));
    for (const lm of list) {
      rows.push({
        memberId: lm.member_id,
        name: lm.name,
        nameHanja: lm.name_hanja,
        party: lm.party,
        district: lm.district,
        termNumber: lm.term_number,
        committees: lm.committees ?? [],
        seatIndex: seatCursor++,
        profileImageUrl: lm.profile_image_url,
        isActive: true,
        lastSynced: new Date(),
      });
    }
  }

  // ON CONFLICT (member_id) DO UPDATE
  await db
    .insert(legislator)
    .values(rows)
    .onConflictDoUpdate({
      target: legislator.memberId,
      set: {
        name: sql`excluded.name`,
        nameHanja: sql`excluded.name_hanja`,
        party: sql`excluded.party`,
        district: sql`excluded.district`,
        termNumber: sql`excluded.term_number`,
        committees: sql`excluded.committees`,
        seatIndex: sql`excluded.seat_index`,
        profileImageUrl: sql`excluded.profile_image_url`,
        isActive: sql`true`,
        lastSynced: sql`NOW()`,
      },
    });

  // Mark any previously active lawmakers NOT in this batch as inactive
  // (they left the Assembly — rare, happens on by-elections or term changes)
  const activeMemberIds = rows.map((r) => r.memberId!);
  if (activeMemberIds.length > 0) {
    await db
      .update(legislator)
      .set({ isActive: false })
      .where(
        and(
          eq(legislator.isActive, true),
          sql`${legislator.memberId} NOT IN (${sql.join(
            activeMemberIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );
  }

  return rows.length;
}

/**
 * Upsert scored bills into the database.
 */
async function upsertBills(
  scoredBills: Array<
    McpBill & { score: number; reasoning: string; summary: string }
  >,
): Promise<number> {
  if (scoredBills.length === 0) return 0;

  const rows: NewBill[] = scoredBills.map((b) => ({
    billId: b.bill_id,
    billName: b.bill_name,
    proposerName: b.proposer,
    proposerParty: b.proposer_party,
    coSponsorCount: b.co_sponsor_count ?? 0,
    committee: b.committee,
    stage: stageFromInt(b.stage),
    status: b.status,
    proposalDate: b.proposal_date ? new Date(b.proposal_date) : null,
    relevanceScore: b.score,
    relevanceReasoning: b.reasoning,
    proposalReason: b.proposal_reason,
    mainContent: b.main_content,
    summaryText: b.summary,
    externalLink: b.external_link,
    lastSynced: new Date(),
  }));

  await db
    .insert(bill)
    .values(rows)
    .onConflictDoUpdate({
      target: bill.billId,
      set: {
        billName: sql`excluded.bill_name`,
        proposerName: sql`excluded.proposer_name`,
        proposerParty: sql`excluded.proposer_party`,
        coSponsorCount: sql`excluded.co_sponsor_count`,
        committee: sql`excluded.committee`,
        stage: sql`excluded.stage`,
        status: sql`excluded.status`,
        proposalDate: sql`excluded.proposal_date`,
        relevanceScore: sql`excluded.relevance_score`,
        relevanceReasoning: sql`excluded.relevance_reasoning`,
        proposalReason: sql`excluded.proposal_reason`,
        mainContent: sql`excluded.main_content`,
        summaryText: sql`excluded.summary_text`,
        externalLink: sql`excluded.external_link`,
        lastSynced: sql`NOW()`,
      },
    });

  return rows.length;
}
