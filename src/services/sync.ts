/**
 * Sync service — orchestrates the daily sync pipeline.
 *
 *   morning sync (06:30 KST)    evening sync (18:30 KST)
 *   ────────────────────────    ────────────────────────
 *   1. Upsert all legislators    1. Re-fetch detail for high-score,
 *      (295 from 22대)              non-terminal bills
 *   2. For each watched cte:     2. Derive new stage from 심사경과
 *      assembly_bill (list)      3. Insert BillTimeline + Alert on
 *   3. Keyword pre-filter           transition
 *   4. assembly_bill (detail)    4. Log to SyncLog
 *      for matched bills
 *   5. Gemini score + summary
 *   6. Upsert bills + timeline
 *   7. Fetch schedule (30 days)
 *   8. Generate DailyBriefing
 *   9. Log to SyncLog
 *
 * ── Dependency inversion ──────────────────────────────────
 * This service does NOT import gemini-client directly. Instead it
 * accepts `BillScorer` and `BriefingGenerator` interfaces through
 * the orchestrator function, so Lane B (Gemini) can be swapped in
 * later without changing this file, and tests can pass fakes.
 *
 * ── Real MCP API shape ────────────────────────────────────
 * This file targets the real assembly-api-mcp server (6 tools).
 * Field names come through in Korean: 의안ID, 의안명, 제안자,
 * 소관위원회, 제안일, 대표발의자, 공동발의자, 심사경과, etc.
 *
 * Legislators are fetched via `query_assembly("nwvrqwxyaytdsfvhu")`
 * because that endpoint returns MONA_CD (stable ID) + HJ_NM + full
 * committee list, while `assembly_member` lacks stable IDs.
 *
 * Bills use a two-phase fetch:
 *   Phase 1: assembly_bill({ committee, age }) → list only
 *   Phase 2: assembly_bill({ bill_id }) → 심사경과 + 공동발의자[]
 *
 * See docs/mcp-api-reality.md for raw sample responses and field maps.
 *
 * MCP detail alone does not expose reliable 제안이유 / 주요내용, so
 * we optionally enrich bill bodies from the billInfo.do fragment when
 * the DB does not already have them.
 */

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bill,
  billTimeline,
  industryProfile,
  industryCommittee,
  industryBillWatch,
  legislationNotice,
  legislator,
  syncLog,
  alert,
  type NewBill,
  type NewLegislationNotice,
  type NewLegislator,
  type Bill,
} from "@/db/schema";
import { callMcpToolOrThrow } from "@/lib/mcp-client";
import { errorMessage } from "@/lib/api-base";
import { fetchBillBodyFragment } from "@/lib/bill-scraper";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { syncNews } from "@/services/news-sync";

/* ─────────────────────────────────────────────────────────────
 * Bill stage enum literal — matches `bill_stage` postgres enum.
 * Hoisted so billTimeline inserts (which have no default) get a
 * narrowed type at the call site.
 * ────────────────────────────────────────────────────────────── */

type BillStage =
  | "stage_0"
  | "stage_1"
  | "stage_2"
  | "stage_3"
  | "stage_4"
  | "stage_5"
  | "stage_6";

/* ─────────────────────────────────────────────────────────────
 * Dependency contracts (injected by orchestrator)
 * ────────────────────────────────────────────────────────────── */

export interface BillScorer {
  scoreBill(input: {
    billName: string;
    committee: string | null;
    proposerName: string;
    proposerParty: string | null;
    proposalReason: string | null;
    mainContent: string | null;
    industryName: string;
    industryContext: string;
    industryKeywords: string[];
  }): Promise<{ score: number; reasoning: string }>;

  summarizeBill(input: {
    billName: string;
    committee: string | null;
    proposerName: string;
    proposalReason: string | null;
    mainContent: string | null;
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
 * Real MCP response shapes (Korean field names)
 * ────────────────────────────────────────────────────────────── */

/** `assembly_bill` search mode — list item. */
interface McpBillListItem {
  의안ID: string;
  의안번호: string;
  의안명: string;
  제안자: string | null; // "박성훈의원 등 10인"
  제안자구분: string | null;
  대수: string | null;
  소관위원회: string | null;
  제안일: string | null; // "YYYY-MM-DD"
  처리상태: string | null;
  처리일: string | null;
  상세링크: string | null;
  대표발의자: string | null;
  공동발의자: string | null; // "김기현,이달희,..." (comma-joined)
}

interface McpBillListResponse {
  total?: number;
  items?: McpBillListItem[];
}

/** `assembly_bill` detail mode (bill_id param). */
interface McpBillDetailSimsa {
  소관위원회: string | null;
  소관위_회부일: string | null;
  소관위_상정일: string | null;
  소관위_처리일: string | null;
  소관위_처리결과: string | null;
  법사위_회부일: string | null;
  법사위_상정일: string | null;
  법사위_처리일: string | null;
  법사위_처리결과: string | null;
  본회의_상정일: string | null;
  본회의_의결일: string | null;
  본회의_결과: string | null;
  정부이송일: string | null;
  공포일: string | null;
  공포번호: string | null;
}

interface McpBillDetailItem {
  의안ID: string;
  의안번호: string;
  의안명: string;
  제안이유: string | null; // Always null currently — MCP limitation
  주요내용: string | null; // Always null currently
  LINK_URL: string | null;
  의안문서_ZIP: string | null;
  공동발의자: Array<{
    이름: string;
    정당: string;
    대표구분: string; // "대표발의" or ""
  }>;
  공동발의자_총수: number;
  심사경과: McpBillDetailSimsa;
}

interface McpBillDetailResponse {
  total?: number;
  items?: McpBillDetailItem[];
}

/** `query_assembly("nwvrqwxyaytdsfvhu")` — 전체 의원 현황 row. */
interface McpLegislatorRow {
  HG_NM: string; // 한글이름
  HJ_NM: string | null; // 한자이름
  ENG_NM: string | null;
  BTH_GBN_NM: string | null;
  BTH_DATE: string | null;
  JOB_RES_NM: string | null; // "위원"/"위원장"/"간사"
  POLY_NM: string; // 정당
  ORIG_NM: string; // 선거구 or "비례대표"
  ELECT_GBN_NM: string; // "지역구"/"비례대표"
  CMIT_NM: string | null; // 현재 primary 위원회
  CMITS: string | null; // 모든 위원회 (comma-separated)
  REELE_GBN_NM: string; // "초선"/"재선"/"3선"/...
  UNITS: string; // "제21대, 제22대"
  SEX_GBN_NM: string | null;
  TEL_NO: string | null;
  E_MAIL: string | null;
  HOMEPAGE: string | null;
  STAFF: string | null;
  SECRETARY: string | null;
  SECRETARY2: string | null;
  MONA_CD: string; // stable member ID — primary key source
  MEM_TITLE: string | null;
  ASSEM_ADDR: string | null;
}

interface McpQueryAssemblyResponse {
  api?: string;
  total?: number;
  returned?: number;
  fields?: string[];
  items?: McpLegislatorRow[];
}

/** `assembly_session({ type: "schedule" })` — event row. */
interface McpScheduleRow {
  일정종류: string;
  일자: string; // "YYYY-MM-DD"
  시간: string; // "14:00~16:30"
  위원회: string | null;
  내용: string;
  장소: string | null;
}

interface McpScheduleResponse {
  mode?: string;
  total?: number;
  items?: McpScheduleRow[];
}

interface McpLegislationNoticeItem {
  의안번호: string;
  법률안명: string;
  제안자구분: string | null;
  소관위: string | null;
  게시종료일: string | null;
}

interface McpLegislationNoticeResponse {
  type?: string;
  total?: number;
  items?: McpLegislationNoticeItem[];
}

interface McpCommitteeMember {
  이름: string;
  정당: string | null;
  선거구: string | null;
  직위: string | null;
  의원코드: string | null;
}

interface McpCommitteeResponse {
  type?: string;
  total?: number;
  items?: Array<{
    위원회명: string;
    위원회구분: string | null;
    위원장: string | null;
    간사: string | null;
    현원: number | null;
    정원: number | null;
    위원목록?: McpCommitteeMember[];
  }>;
}

/** Normalized schedule item passed to the briefing generator. */
export interface ScheduleItem {
  date: string;
  time: string;
  committee: string | null;
  subject: string;
  location: string | null;
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

/** N days from today in KST as "YYYY-MM-DD" */
function kstDateOffset(days: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS + days * 86400000);
  return kst.toISOString().slice(0, 10);
}

/**
 * Parse "3선" / "재선" / "초선" into an integer term count.
 * Returns null for unknown strings.
 */
function parseTermNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  if (s === "초선") return 1;
  if (s === "재선") return 2;
  const m = s.match(/^(\d+)선$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/**
 * Derive the app's bill stage from the MCP detail response's
 * `심사경과` object. Stages follow the GR/PA Excel convention:
 *
 *   0 = 발의예정 (unused here — MCP only surfaces filed bills)
 *   1 = 법안발의/입법예고   — only 회부 없음
 *   2 = 상임위 심사/계류중  — 소관위_회부일 있음
 *   3 = 법제사법위 심사     — 법사위_회부일 있음
 *   4 = 국회 본회의 가결    — 본회의_결과 === "원안가결"/"수정가결"
 *   5 = 정부 이송           — 정부이송일 있음
 *   6 = 공포                — 공포일 있음
 *
 * Falls back to stage_1 when everything is null (freshly filed).
 */
export function stageFromSimsa(simsa: McpBillDetailSimsa | undefined): BillStage {
  if (!simsa) return "stage_1";
  if (simsa.공포일) return "stage_6";
  if (simsa.정부이송일) return "stage_5";
  const result = simsa.본회의_결과;
  if (result && (result.includes("가결") || result.includes("부결"))) {
    return "stage_4";
  }
  if (simsa.법사위_회부일) return "stage_3";
  if (simsa.소관위_회부일) return "stage_2";
  return "stage_1";
}

/**
 * Extract proposer party from the detail response's 공동발의자 array.
 * Returns null if no "대표발의" entry is present (rare, alternative
 * bills proposed by committees don't have one).
 */
function proposerPartyFromDetail(detail: McpBillDetailItem): string | null {
  const lead = detail.공동발의자?.find((c) => c.대표구분 === "대표발의");
  return lead?.정당 ?? null;
}

/**
 * Parse a YYYY-MM-DD string to a Date at KST midnight. Returns null
 * on invalid input.
 */
function parseKstDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // Treat as KST date — convert to UTC by subtracting 9h
  return new Date(
    Date.UTC(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      0,
      0,
      0,
    ) - KST_OFFSET_MS,
  );
}

/** Normalize a Postgres date column input (YYYY-MM-DD or null). */
function normalizeDateOnly(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function dateToListDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function storedBillToListItem(stored: {
  billId: string;
  billNumber: string | null;
  billName: string;
  proposerName: string;
  committee: string | null;
  proposalDate: Date | string | null;
  status: string | null;
  externalLink: string | null;
}): McpBillListItem {
  return {
    의안ID: stored.billId,
    의안번호: stored.billNumber ?? "",
    의안명: stored.billName,
    제안자: stored.proposerName,
    제안자구분: null,
    대수: "22",
    소관위원회: stored.committee,
    제안일: dateToListDate(stored.proposalDate),
    처리상태: stored.status,
    처리일: null,
    상세링크: stored.externalLink,
    대표발의자: stored.proposerName,
    공동발의자: null,
  };
}

/** Join MCP staff/secretary name fragments into a single raw string. */
function joinRawNames(
  ...parts: Array<string | null | undefined>
): string | null {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return normalized.length > 0 ? normalized.join(", ") : null;
}

/**
 * Decode HTML entities from MCP text fields. The Assembly API returns
 * raw entities (`&middot;`, `&amp;`, numeric) inside HG_NM, MEM_TITLE,
 * STAFF, SECRETARY, ORIG_NM, etc. We decode at the boundary so the rest
 * of the app treats text as plain Unicode.
 */
function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return decodeHtmlEntities(value);
}

function committeesFromRow(row: McpLegislatorRow): string[] {
  if (row.CMITS) {
    return row.CMITS.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return row.CMIT_NM ? [row.CMIT_NM] : [];
}

function ingestLegislatorRow(
  row: McpLegislatorRow,
  seatIndex: number,
): NewLegislator {
  return {
    memberId: row.MONA_CD,
    name: decodeHtmlEntities(row.HG_NM),
    nameHanja: cleanText(row.HJ_NM),
    nameEnglish: cleanText(row.ENG_NM),
    party: decodeHtmlEntities(row.POLY_NM),
    district: cleanText(row.ORIG_NM),
    electionType: cleanText(row.ELECT_GBN_NM),
    termNumber: parseTermNumber(row.REELE_GBN_NM),
    birthDate: normalizeDateOnly(row.BTH_DATE),
    birthCalendar: cleanText(row.BTH_GBN_NM),
    gender: cleanText(row.SEX_GBN_NM),
    termHistory: cleanText(row.UNITS),
    committeeRole: cleanText(row.JOB_RES_NM),
    committees: committeesFromRow(row).map((c) => decodeHtmlEntities(c)),
    seatIndex,
    email: cleanText(row.E_MAIL),
    homepage: cleanText(row.HOMEPAGE),
    officePhone: cleanText(row.TEL_NO),
    officeAddress: cleanText(row.ASSEM_ADDR),
    staffRaw: cleanText(row.STAFF),
    secretaryRaw: cleanText(joinRawNames(row.SECRETARY, row.SECRETARY2)),
    memTitle: cleanText(row.MEM_TITLE),
    isActive: true,
    lastSynced: new Date(),
  };
}

/**
 * Keyword pre-filter against the 의안명 only. MCP does not give us
 * body text, so title is all we have for cheap filtering.
 * Returns true when any keyword matches.
 */
function keywordMatches(
  listItem: McpBillListItem,
  keywords: string[],
): boolean {
  if (keywords.length === 0) return true; // no filter → keep all
  const haystack = (listItem.의안명 ?? "").toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

export function noticeIsRelevant(
  billName: string,
  keywords: string[],
): boolean {
  if (keywords.length === 0) return false;
  const haystack = billName.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

const ROLE_PRIORITY: Record<string, number> = {
  위원장: 3,
  간사: 2,
  위원: 1,
};

function rolePriority(role: string | null | undefined): number {
  if (!role) return 0;
  return ROLE_PRIORITY[role] ?? 0;
}

interface EveningTransitionPersistResult {
  updated: boolean;
  timelineInserted: boolean;
  alertInserted: boolean;
}

async function persistEveningStageTransition(
  tracked: Pick<Bill, "id" | "billName" | "stage">,
  newStage: BillStage,
): Promise<EveningTransitionPersistResult> {
  const description = `${tracked.stage} → ${newStage}`;
  const message = `${tracked.billName} — ${description}`;
  const eventDate = new Date();

  const [existingTimeline] = await db
    .select({ id: billTimeline.id })
    .from(billTimeline)
    .where(
      and(
        eq(billTimeline.billId, tracked.id),
        eq(billTimeline.stage, newStage),
        eq(billTimeline.description, description),
      ),
    )
    .limit(1);

  let timelineInserted = false;
  if (!existingTimeline) {
    await db.insert(billTimeline).values({
      billId: tracked.id,
      stage: newStage,
      eventDate,
      description,
    });
    timelineInserted = true;
  }

  const [existingAlert] = await db
    .select({ id: alert.id })
    .from(alert)
    .where(
      and(
        eq(alert.type, "stage_change"),
        eq(alert.billId, tracked.id),
        eq(alert.message, message),
      ),
    )
    .limit(1);

  let alertInserted = false;
  if (!existingAlert) {
    await db.insert(alert).values({
      type: "stage_change",
      billId: tracked.id,
      message,
    });
    alertInserted = true;
  }

  const updatedRows = await db
    .update(bill)
    .set({
      stage: newStage,
      lastSynced: new Date(),
    })
    .where(and(eq(bill.id, tracked.id), eq(bill.stage, tracked.stage)))
    .returning({ id: bill.id });

  return {
    updated: updatedRows.length > 0,
    timelineInserted,
    alertInserted,
  };
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
 * Run the morning sync pipeline. Called by /api/cron/sync-morning.
 *
 * Errors in individual steps are collected but don't abort the
 * whole pipeline — partial success beats total failure.
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
  const manualWatchRows = await db
    .select({
      billId: bill.billId,
      billNumber: bill.billNumber,
      billName: bill.billName,
      proposerName: bill.proposerName,
      committee: bill.committee,
      proposalDate: bill.proposalDate,
      status: bill.status,
      externalLink: bill.externalLink,
    })
    .from(industryBillWatch)
    .innerJoin(bill, eq(industryBillWatch.billId, bill.billId))
    .where(eq(industryBillWatch.industryProfileId, activeProfile.id));

  // 3. Sync legislators — but only when stale (≥ 7 days) or empty.
  //    The 22대 roster rarely changes, and the MCP upstream is slow
  //    (60-90s cold start), so daily refetch is wasteful.
  try {
    const [stats] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
        // Neon returns timestamps as ISO strings, not Date objects.
        mostRecent: sql<string | null>`MAX(${legislator.lastSynced})::text`,
      })
      .from(legislator);

    const SEVEN_DAYS_MS = 7 * 86400 * 1000;
    const mostRecentMs = stats?.mostRecent
      ? new Date(stats.mostRecent).getTime()
      : 0;
    const isStale =
      !stats ||
      stats.count === 0 ||
      !stats.mostRecent ||
      Date.now() - mostRecentMs > SEVEN_DAYS_MS;

    if (isStale) {
      legislatorsUpdated = await syncLegislators();
    } else {
      console.log(
        `[sync] legislators fresh (${stats.count} rows, last synced ${stats.mostRecent}) — skipping`,
      );
    }
  } catch (err) {
    errors.push(`legislators: ${errorMessage(err)}`);
  }

  // 3b. Refresh real-time committee leadership for watched committees.
  try {
    await syncCommitteeMembers(committeeCodes);
  } catch (err) {
    errors.push(`committee_members: ${errorMessage(err)}`);
  }

  // 4. Phase 1 — discover bills per watched committee (in parallel,
  //    bounded by mcp-client's internal p-limit(5))
  const listItems: McpBillListItem[] = [];
  const committeesToQuery =
    committeeCodes.length > 0 ? committeeCodes : [""];

  const listFetches = await Promise.allSettled(
    committeesToQuery.map((code) =>
      callMcpToolOrThrow<McpBillListResponse>(
        "assembly_bill",
        code
          ? { committee: code, age: 22, page_size: 100 }
          : { age: 22, page_size: 100 },
      ),
    ),
  );

  for (let i = 0; i < listFetches.length; i++) {
    const r = listFetches[i];
    const code = committeesToQuery[i];
    if (r.status === "fulfilled") {
      listItems.push(...(r.value.items ?? []));
    } else {
      errors.push(
        `assembly_bill(${code || "all"}): ${errorMessage(r.reason)}`,
      );
    }
  }

  // Deduplicate by 의안ID
  const uniqueList = Array.from(
    new Map(listItems.map((b) => [b.의안ID, b])).values(),
  );
  billsProcessed = uniqueList.length;

  // 5. Keyword pre-filter (title-only)
  const filtered = uniqueList.filter((b) => keywordMatches(b, keywords));
  const detailTargets = Array.from(
    new Map(
      [
        ...filtered,
        ...manualWatchRows.map((row) => storedBillToListItem(row)),
      ].map((item) => [item.의안ID, item]),
    ).values(),
  );
  billsProcessed = detailTargets.length;

  // 6. Phase 2 — fetch detail for matched bills (parallel via p-limit).
  //    Skip bills we already have at the same stage (not implemented yet;
  //    for now refetch every morning — 20-50 bills is fine).
  const detailFetches = await Promise.allSettled(
    detailTargets.map(async (item) => {
      const resp = await callMcpToolOrThrow<McpBillDetailResponse>(
        "assembly_bill",
        { bill_id: item.의안ID },
      );
      const detail = resp.items?.[0];
      if (!detail) throw new Error(`empty detail for ${item.의안ID}`);
      return { listItem: item, detail };
    }),
  );

  // 7. Score + summarize (sequential — Lane B can parallelize when ready)
  type ScoredBill = {
    listItem: McpBillListItem;
    detail: McpBillDetailItem;
    score: number;
    reasoning: string;
    summary: string;
  };
  const scoredBills: ScoredBill[] = [];
  const existingBodies =
    detailTargets.length > 0
      ? await db
          .select({
            billId: bill.billId,
            proposalReason: bill.proposalReason,
            mainContent: bill.mainContent,
          })
          .from(bill)
          .where(inArray(bill.billId, detailTargets.map((item) => item.의안ID)))
      : [];
  const existingBodyByBillId = new Map(
    existingBodies.map((row) => [row.billId, row]),
  );

  for (const f of detailFetches) {
    if (f.status !== "fulfilled") {
      errors.push(`detail: ${errorMessage(f.reason)}`);
      continue;
    }
    const { listItem, detail } = f.value;
    try {
      const existingBody = existingBodyByBillId.get(listItem.의안ID);
      let proposalReason =
        detail.제안이유 ?? existingBody?.proposalReason ?? null;
      let mainContent =
        detail.주요내용 ?? existingBody?.mainContent ?? null;

      if (!proposalReason && !mainContent) {
        const body = await fetchBillBodyFragment(listItem.의안ID);
        if (body) {
          proposalReason = body.proposalReason;
          mainContent = body.mainContent;
        }
      }

      const enrichedDetail: McpBillDetailItem = {
        ...detail,
        제안이유: proposalReason,
        주요내용: mainContent,
      };

      const [scoreResult, summary] = await Promise.all([
        deps.scorer.scoreBill({
          billName: enrichedDetail.의안명 ?? listItem.의안명,
          committee: listItem.소관위원회,
          proposerName: listItem.대표발의자 ?? "",
          proposerParty: proposerPartyFromDetail(enrichedDetail),
          proposalReason,
          mainContent,
          industryName: activeProfile.name,
          industryContext: activeProfile.llmContext,
          industryKeywords: keywords,
        }),
        deps.scorer.summarizeBill({
          billName: enrichedDetail.의안명 ?? listItem.의안명,
          committee: listItem.소관위원회,
          proposerName: listItem.대표발의자 ?? "",
          proposalReason,
          mainContent,
        }),
      ]);

      scoredBills.push({
        listItem,
        detail: enrichedDetail,
        score: scoreResult.score,
        reasoning: scoreResult.reasoning,
        summary,
      });
      billsScored++;
    } catch (err) {
      errors.push(`score(${listItem.의안ID}): ${errorMessage(err)}`);
    }
  }

  // 8. Upsert bills + timeline
  try {
    await upsertBills(scoredBills);
  } catch (err) {
    errors.push(`upsert_bills: ${errorMessage(err)}`);
  }

  // 8.5. News fetch (Naver) — uses the freshly-upserted bill scores
  //      to pick which ones to query. Failures don't block the sync.
  let newsFetched = 0;
  try {
    const newsResult = await syncNews(keywords, {
      maxBills: 10,
      perBillDisplay: 5,
      industryDisplay: 10,
    });
    newsFetched = newsResult.articlesUpserted;
    errors.push(...newsResult.errors);
  } catch (err) {
    errors.push(`news: ${errorMessage(err)}`);
  }

  // 9. Fetch upcoming schedule (next 30 days)
  let scheduleItems: ScheduleItem[] = [];
  try {
    const schedResp = await callMcpToolOrThrow<McpScheduleResponse>(
      "assembly_session",
      {
        type: "schedule",
        date_from: todayKstDate(),
        date_to: kstDateOffset(30),
        page_size: 100,
      },
    );
    scheduleItems = (schedResp.items ?? []).map((it) => ({
      date: it.일자,
      time: it.시간,
      committee: it.위원회,
      subject: it.내용,
      location: it.장소,
    }));
  } catch (err) {
    errors.push(`schedule: ${errorMessage(err)}`);
  }

  // 10. Generate daily briefing
  const briefingDate = todayKstDate();
  try {
    const topBills = await db
      .select()
      .from(bill)
      .where(sql`${bill.relevanceScore} >= 4`)
      .orderBy(sql`${bill.relevanceScore} DESC`, sql`${bill.proposalDate} DESC NULLS LAST`)
      .limit(4);

    const newBills = await db
      .select()
      .from(bill)
      .where(sql`${bill.createdAt} > NOW() - INTERVAL '24 hours'`)
      .orderBy(sql`${bill.createdAt} DESC`, sql`${bill.proposalDate} DESC NULLS LAST`)
      .limit(10);

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

  // 10. Legislation notice monitoring (pre-filing early signals)
  try {
    await syncLegislationNotices(keywords);
  } catch (err) {
    errors.push(`legislation_notices: ${errorMessage(err)}`);
  }

  // 11. Write sync log
  const status: MorningSyncResult["status"] =
    errors.length === 0 ? "success" : billsScored > 0 ? "partial" : "failed";

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
      newsFetched,
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
 * Evening sync: stage change detection for tracked bills
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
 * Evening sync — lightweight change detection for bills already in
 * the database. Runs at 18:30 KST. Catches afternoon legislative
 * activity (committee passes, votes) before the next morning's sync.
 *
 * No Gemini calls. No briefing regeneration. Just:
 *   1. Pull high-relevance, non-terminal bills (score >= 3, stage < 6)
 *   2. For each, call assembly_bill({ bill_id }) to get 심사경과
 *   3. If derived stage changed: update + create alert + timeline row
 */
export async function runEveningSync(): Promise<EveningSyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let billsChecked = 0;
  let stageTransitions = 0;
  let alertsCreated = 0;

  const trackedBills = await db
    .select({ billId: industryBillWatch.billId })
    .from(industryBillWatch)
    .innerJoin(industryProfile, eq(industryBillWatch.industryProfileId, industryProfile.id))
    .limit(1000);

  const manualBillIds = trackedBills.map((row) => row.billId);
  const billsToCheck = await db
    .select()
    .from(bill)
    .where(
      and(
        sql`${bill.stage} != 'stage_6'`,
        manualBillIds.length > 0
          ? or(
              sql`${bill.relevanceScore} >= 3`,
              inArray(bill.billId, manualBillIds),
            )
          : sql`${bill.relevanceScore} >= 3`,
      ),
    );

  // Parallel fetch (p-limit inside mcp-client caps at 5)
  const results = await Promise.allSettled(
    billsToCheck.map(async (tracked) => {
      const resp = await callMcpToolOrThrow<McpBillDetailResponse>(
        "assembly_bill",
        { bill_id: tracked.billId },
      );
      const detail = resp.items?.[0];
      if (!detail) throw new Error(`empty detail for ${tracked.billId}`);
      return { tracked, detail };
    }),
  );

  for (const r of results) {
    billsChecked++;
    if (r.status !== "fulfilled") {
      errors.push(`evening: ${errorMessage(r.reason)}`);
      continue;
    }
    const { tracked, detail } = r.value;
    const newStage = stageFromSimsa(detail.심사경과);
    if (newStage === tracked.stage) continue;

    try {
      const persisted = await persistEveningStageTransition(tracked, newStage);
      if (persisted.updated) {
        stageTransitions++;
      }
      if (persisted.alertInserted) {
        alertsCreated++;
      }
    } catch (err) {
      errors.push(`evening(${tracked.billId}): ${errorMessage(err)}`);
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
      billsScored: 0,
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
 * Legislator sync via query_assembly("nwvrqwxyaytdsfvhu")
 * ────────────────────────────────────────────────────────────── */

/**
 * Fetch ALL 22대 legislators via the stable 전체 의원 현황 API and
 * upsert into the legislator table.
 *
 * The server caps `page_size` at 100, so we page through until we
 * have all 295 members.
 *
 * ⚠️ Observed issue 2026-04-10: the upstream server can take 60-90s
 * for the first call after idle, and occasionally returns "Invalid
 * or expired session" on the 3rd+ sequential call. We sleep 1s
 * between pages to let the server settle and catch per-page errors
 * so a partial fetch still gets upserted.
 *
 * Returns the number of rows inserted/updated.
 */
export async function syncLegislators(): Promise<number> {
  const PAGE_SIZE = 100;
  const rows: McpLegislatorRow[] = [];
  let page = 1;
  const errors: string[] = [];

  // Hard safety cap — the Assembly has ≤ 300 members, so 5 pages is plenty.
  while (page <= 5) {
    if (page > 1) await new Promise((r) => setTimeout(r, 1000));

    try {
      const resp = await callMcpToolOrThrow<McpQueryAssemblyResponse>(
        "query_assembly",
        {
          api_code: "nwvrqwxyaytdsfvhu",
          params: { AGE: 22 },
          page,
          page_size: PAGE_SIZE,
        },
      );
      const batch = resp.items ?? [];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break; // last page
      page++;
    } catch (err) {
      errors.push(`legislator page ${page}: ${errorMessage(err)}`);
      break; // stop paging; upsert whatever we have
    }
  }

  if (errors.length > 0) {
    console.warn("[syncLegislators] partial fetch:", errors);
  }

  if (rows.length === 0) return 0;

  // Group by party for seat index computation — alphabetical within party
  const byParty = new Map<string, McpLegislatorRow[]>();
  for (const r of rows) {
    const list = byParty.get(r.POLY_NM) ?? [];
    list.push(r);
    byParty.set(r.POLY_NM, list);
  }

  // Deterministic seat assignment: sort parties by size (largest left),
  // then by MONA_CD within party.
  const sortedParties = [...byParty.keys()].sort((a, b) => {
    const diff = (byParty.get(b)!.length ?? 0) - (byParty.get(a)!.length ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  let seatCursor = 0;
  const inserts: NewLegislator[] = [];

  for (const party of sortedParties) {
    const list = byParty.get(party)!;
    list.sort((a, b) => a.MONA_CD.localeCompare(b.MONA_CD));
    for (const r of list) {
      inserts.push(ingestLegislatorRow(r, seatCursor++));
    }
  }

  // Upsert on member_id conflict
  await db
    .insert(legislator)
    .values(inserts)
    .onConflictDoUpdate({
      target: legislator.memberId,
      set: {
        name: sql`excluded.name`,
        nameHanja: sql`excluded.name_hanja`,
        nameEnglish: sql`excluded.name_english`,
        party: sql`excluded.party`,
        district: sql`excluded.district`,
        electionType: sql`excluded.election_type`,
        termNumber: sql`excluded.term_number`,
        birthDate: sql`excluded.birth_date`,
        birthCalendar: sql`excluded.birth_calendar`,
        gender: sql`excluded.gender`,
        termHistory: sql`excluded.term_history`,
        committeeRole: sql`excluded.committee_role`,
        committees: sql`excluded.committees`,
        seatIndex: sql`excluded.seat_index`,
        email: sql`excluded.email`,
        homepage: sql`excluded.homepage`,
        officePhone: sql`excluded.office_phone`,
        officeAddress: sql`excluded.office_address`,
        staffRaw: sql`excluded.staff_raw`,
        secretaryRaw: sql`excluded.secretary_raw`,
        memTitle: sql`excluded.mem_title`,
        isActive: sql`true`,
        lastSynced: sql`NOW()`,
      },
    });

  // Mark any previously active legislators NOT in this batch as inactive
  // (rare — by-elections, expulsions, resignation).
  const activeIds = inserts.map((i) => i.memberId);
  if (activeIds.length > 0) {
    await db
      .update(legislator)
      .set({ isActive: false })
      .where(
        and(
          eq(legislator.isActive, true),
          sql`${legislator.memberId} NOT IN (${sql.join(
            activeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );
  }

  return inserts.length;
}

/**
 * Fetch legislation notices from assembly_org and persist them as an
 * early-warning feed for the briefing page.
 */
export async function syncLegislationNotices(
  keywords: string[],
): Promise<number> {
  const resp = await callMcpToolOrThrow<McpLegislationNoticeResponse>(
    "assembly_org",
    {
      type: "legislation_notice",
      page_size: 50,
    },
  );

  const rows: NewLegislationNotice[] = (resp.items ?? [])
    .filter((item) => item.의안번호 && item.법률안명)
    .map((item) => ({
      billNumber: item.의안번호,
      billName: item.법률안명,
      proposerType: item.제안자구분,
      committee: item.소관위,
      noticeEndDate: normalizeDateOnly(item.게시종료일),
      isRelevant: noticeIsRelevant(item.법률안명, keywords),
    }));

  if (rows.length === 0) return 0;

  await db
    .insert(legislationNotice)
    .values(rows)
    .onConflictDoUpdate({
      target: legislationNotice.billNumber,
      set: {
        billName: sql`excluded.bill_name`,
        proposerType: sql`excluded.proposer_type`,
        committee: sql`excluded.committee`,
        noticeEndDate: sql`excluded.notice_end_date`,
        isRelevant: sql`excluded.is_relevant`,
        fetchedAt: sql`NOW()`,
      },
    });

  return rows.filter((row) => row.isRelevant).length;
}

/**
 * Refresh committee leadership metadata from assembly_org. When a
 * legislator belongs to multiple watched committees, the highest role
 * wins: 위원장 > 간사 > 위원.
 */
export async function syncCommitteeMembers(
  committeeNames: string[],
): Promise<void> {
  if (committeeNames.length === 0) return;

  const currentLegislators = await db
    .select({
      memberId: legislator.memberId,
      name: legislator.name,
      committeeRole: legislator.committeeRole,
    })
    .from(legislator)
    .where(eq(legislator.isActive, true));

  const existingByMemberId = new Map(
    currentLegislators.map((row) => [row.memberId, row]),
  );
  const bestRoleByMemberId = new Map<string, string>();

  for (const committeeName of committeeNames) {
    const resp = await callMcpToolOrThrow<McpCommitteeResponse>("assembly_org", {
      type: "committee",
      committee_name: committeeName,
      include_members: true,
    });

    const members = resp.items?.[0]?.위원목록 ?? [];
    for (const member of members) {
      const memberCode = member.의원코드?.trim();
      const newRole = member.직위?.trim();
      if (!memberCode || !newRole) continue;

      const bufferedRole =
        bestRoleByMemberId.get(memberCode) ??
        existingByMemberId.get(memberCode)?.committeeRole ??
        null;

      if (rolePriority(newRole) > rolePriority(bufferedRole)) {
        bestRoleByMemberId.set(memberCode, newRole);
      }
    }
  }

  for (const [memberCode, nextRole] of bestRoleByMemberId) {
    const existing = existingByMemberId.get(memberCode);
    if (!existing || existing.committeeRole === nextRole) continue;

    await db
      .update(legislator)
      .set({ committeeRole: nextRole })
      .where(eq(legislator.memberId, memberCode));

    if (rolePriority(nextRole) >= ROLE_PRIORITY.간사) {
      console.log(
        `[syncCommitteeMembers] ${existing.name} (${memberCode}): ${existing.committeeRole ?? "—"} -> ${nextRole}`,
      );
    }
  }
}

/* ─────────────────────────────────────────────────────────────
 * Bill upsert (with timeline seeding from 심사경과 timestamps)
 * ────────────────────────────────────────────────────────────── */

interface ScoredBillForUpsert {
  listItem: McpBillListItem;
  detail: McpBillDetailItem;
  score: number;
  reasoning: string;
  summary: string;
}

/**
 * Upsert scored bills into the database.
 *
 * Also seeds `bill_timeline` with a single row for the current stage
 * (evening sync appends more on transitions).
 */
async function upsertBills(scored: ScoredBillForUpsert[]): Promise<number> {
  if (scored.length === 0) return 0;

  const rows: NewBill[] = scored.map(
    ({ listItem, detail, score, reasoning, summary }) => {
      const stage = stageFromSimsa(detail.심사경과);
      const proposerParty = proposerPartyFromDetail(detail);
      const coSponsorCount =
        detail.공동발의자_총수 ??
        (listItem.공동발의자?.split(",").filter(Boolean).length ?? 0);
      return {
        billId: listItem.의안ID,
        billNumber: listItem.의안번호,
        billName: detail.의안명 ?? listItem.의안명,
        proposerName: listItem.대표발의자 ?? listItem.제안자 ?? "",
        proposerParty,
        coSponsorCount,
        committee: listItem.소관위원회,
        stage,
        status: listItem.처리상태,
        proposalDate: parseKstDate(listItem.제안일),
        relevanceScore: score,
        relevanceReasoning: reasoning,
        proposalReason: detail.제안이유, // null today (MCP limitation)
        mainContent: detail.주요내용, // null today
        summaryText: summary,
        externalLink: detail.LINK_URL ?? listItem.상세링크,
        lastSynced: new Date(),
      };
    },
  );

  await db
    .insert(bill)
    .values(rows)
    .onConflictDoUpdate({
      target: bill.billId,
      set: {
        billNumber: sql`coalesce(excluded.bill_number, ${bill.billNumber})`,
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
        proposalReason: sql`coalesce(excluded.proposal_reason, ${bill.proposalReason})`,
        mainContent: sql`coalesce(excluded.main_content, ${bill.mainContent})`,
        summaryText: sql`excluded.summary_text`,
        externalLink: sql`coalesce(excluded.external_link, ${bill.externalLink})`,
        lastSynced: sql`NOW()`,
      },
    });

  return rows.length;
}
