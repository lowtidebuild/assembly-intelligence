import { desc, eq, ilike, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@/db";
import { bill, industryBillWatch, industryProfile } from "@/db/schema";
import { callMcpToolOrThrow, hasMcpKey } from "@/lib/mcp-client";
import {
  getGeminiBillScorer,
  shouldUseGeminiOrThrow,
} from "@/lib/gemini-client";
import { getStubBillScorer } from "@/lib/gemini-stub";
import { enrichBillEvidence } from "@/services/evidence-enrichment";
import {
  stageFromSimsa,
  syncVotesForBillTargets,
  type BillScorer,
} from "@/services/sync";

interface McpBillListItem {
  의안ID: string;
  의안번호: string | null;
  의안명: string;
  제안자: string | null;
  소관위원회: string | null;
  제안일: string | null;
  처리상태: string | null;
  상세링크: string | null;
  대표발의자: string | null;
}

interface McpBillListResponse {
  total?: number;
  items?: McpBillListItem[];
}

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
  본회의_결과: string | null;
  본회의_의결일: string | null;
  정부이송일: string | null;
  공포일: string | null;
  공포번호: string | null;
}

interface McpBillDetailItem {
  의안ID: string;
  의안번호: string | null;
  의안명: string;
  제안이유: string | null;
  주요내용: string | null;
  LINK_URL: string | null;
  공동발의자: Array<{
    이름: string;
    정당: string | null;
    대표구분: string | null;
  }>;
  공동발의자_총수: number | null;
  심사경과: McpBillDetailSimsa | undefined;
}

interface McpBillDetailResponse {
  total?: number;
  items?: McpBillDetailItem[];
}

export interface SearchBillResult {
  id?: number;
  billId: string;
  billNumber: string | null;
  billName: string;
  proposerName: string;
  committee: string | null;
  relevanceScore: number | null;
  stage: string | null;
  proposalDate: string | null;
  source: "local" | "mcp";
  tracked: boolean;
}

interface TrackBillInput {
  billId: string;
  billNumber: string | null;
  billName: string;
  proposerName: string;
  committee: string | null;
  proposalDate: string | null;
}

export interface TrackBillResult {
  id: number;
  billId: string;
}

function normalizeSearchKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function buildSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  const terms = new Set<string>();
  if (trimmed) {
    terms.add(trimmed);
  }
  if (trimmed.endsWith("법") && trimmed.length > 2) {
    terms.add(trimmed.slice(0, -1));
  }
  return Array.from(terms).filter((term) => term.length >= 2);
}

function buildBillIdentityKeys(entry: Pick<SearchBillResult, "billId" | "billNumber">) {
  const keys = new Set<string>();
  const billIdKey = normalizeSearchKey(entry.billId);
  const billNumberKey = normalizeSearchKey(entry.billNumber);
  if (billIdKey) keys.add(`id:${billIdKey}`);
  if (billNumberKey) keys.add(`no:${billNumberKey}`);
  return keys;
}

export function mergeBillSearchResults(
  localBills: SearchBillResult[],
  liveBills: SearchBillResult[],
): SearchBillResult[] {
  const merged = [...localBills];
  const seen = new Set<string>();

  for (const row of localBills) {
    for (const key of buildBillIdentityKeys(row)) {
      seen.add(key);
    }
  }

  for (const row of liveBills) {
    const keys = Array.from(buildBillIdentityKeys(row));
    if (keys.some((key) => seen.has(key))) {
      continue;
    }
    merged.push(row);
    for (const key of keys) {
      seen.add(key);
    }
  }

  return merged;
}

function parseKstDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(
    Date.UTC(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10) - 1,
      Number.parseInt(match[3], 10),
      0,
      0,
      0,
    ) - 9 * 60 * 60 * 1000,
  );
}

function normalizeDateOnly(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function proposerPartyFromDetail(detail: McpBillDetailItem): string | null {
  const lead = detail.공동발의자?.find((entry) => entry.대표구분 === "대표발의");
  return lead?.정당 ?? null;
}

function getBillScorer(): BillScorer {
  return shouldUseGeminiOrThrow("bill-monitoring.trackBill")
    ? getGeminiBillScorer()
    : getStubBillScorer();
}

function buildBillRank(query: string, prefixQuery: string): SQL<number> {
  return sql<number>`CASE
    WHEN lower(COALESCE(${bill.billNumber}, '')) = lower(${query}) THEN 0
    WHEN lower(${bill.billName}) = lower(${query}) THEN 1
    WHEN lower(COALESCE(${bill.billNumber}, '')) LIKE lower(${prefixQuery}) THEN 2
    WHEN lower(${bill.billName}) LIKE lower(${prefixQuery}) THEN 3
    WHEN lower(${bill.proposerName}) = lower(${query}) THEN 4
    WHEN lower(${bill.proposerName}) LIKE lower(${prefixQuery}) THEN 5
    ELSE 6
  END`;
}

export async function searchBillsForCommand(
  query: string,
  limit = 5,
): Promise<SearchBillResult[]> {
  const prefixQuery = `${query}%`;
  const searchTerms = buildSearchTerms(query);
  const localConditions = searchTerms.flatMap((term) => [
    ilike(bill.billName, `%${term}%`),
    ilike(bill.billNumber, `%${term}%`),
    ilike(bill.proposerName, `%${term}%`),
  ]);
  const localRows = await db
    .select({
      id: bill.id,
      billId: bill.billId,
      billNumber: bill.billNumber,
      billName: bill.billName,
      proposerName: bill.proposerName,
      committee: bill.committee,
      relevanceScore: bill.relevanceScore,
      stage: bill.stage,
      proposalDate: bill.proposalDate,
    })
    .from(bill)
    .where(or(...localConditions))
    .orderBy(
      buildBillRank(query, prefixQuery),
      sql`${bill.relevanceScore} DESC NULLS LAST`,
      desc(bill.proposalDate),
    )
    .limit(limit);

  const localBills: SearchBillResult[] = localRows.map((row) => ({
    id: row.id,
    billId: row.billId,
    billNumber: row.billNumber,
    billName: row.billName,
    proposerName: row.proposerName,
    committee: row.committee,
    relevanceScore: row.relevanceScore,
    stage: row.stage,
    proposalDate: normalizeDateOnly(row.proposalDate),
    source: "local",
    tracked: true,
  }));

  if (localBills.length >= limit || !hasMcpKey()) {
    return localBills;
  }

  try {
    const liveRows: McpBillListItem[] = [];
    const seenKeys = new Set<string>();

    for (const term of searchTerms) {
      const response = await callMcpToolOrThrow<McpBillListResponse>(
        "assembly_bill",
        { bill_name: term, age: 22, page_size: limit },
      );
      for (const row of response.items ?? []) {
        const key = row.의안ID || row.의안번호 || row.의안명;
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        liveRows.push(row);
      }
      if (liveRows.length >= limit) {
        break;
      }
    }
    const liveBills: SearchBillResult[] = liveRows.map((row) => ({
      billId: row.의안ID,
      billNumber: row.의안번호,
      billName: row.의안명,
      proposerName: row.대표발의자 ?? row.제안자 ?? "제안자 미상",
      committee: row.소관위원회,
      relevanceScore: null,
      stage: null,
      proposalDate: normalizeDateOnly(row.제안일),
      source: "mcp",
      tracked: false,
    }));
    return mergeBillSearchResults(localBills, liveBills).slice(0, limit);
  } catch {
    return localBills;
  }
}

export async function trackBillForActiveProfile(
  input: TrackBillInput,
): Promise<TrackBillResult> {
  const [profile] = await db
    .select({
      id: industryProfile.id,
      name: industryProfile.name,
      llmContext: industryProfile.llmContext,
      keywords: industryProfile.keywords,
    })
    .from(industryProfile)
    .limit(1);

  if (!profile) {
    throw new Error("활성 산업 프로필을 찾을 수 없습니다.");
  }

  const response = await callMcpToolOrThrow<McpBillDetailResponse>(
    "assembly_bill",
    { bill_id: input.billId },
  );
  const detail = response.items?.[0];
  if (!detail) {
    throw new Error(`assembly_bill(${input.billId}) detail 이 비어 있습니다.`);
  }

  const [existingBill] = await db
    .select({
      proposalReason: bill.proposalReason,
      mainContent: bill.mainContent,
    })
    .from(bill)
    .where(eq(bill.billId, input.billId))
    .limit(1);

  const scorer = getBillScorer();
  const billName = detail.의안명 || input.billName;
  const committee = detail.심사경과?.소관위원회 ?? input.committee;
  const proposerName = input.proposerName || "제안자 미상";
  const proposerParty = proposerPartyFromDetail(detail);
  const billNumber = detail.의안번호 ?? input.billNumber;
  const evidenceResult = await enrichBillEvidence({
    billId: input.billId,
    billName,
    committee,
    proposerName,
    proposerParty,
    proposalDate: input.proposalDate,
    mcpBody: {
      proposalReason: detail.제안이유,
      mainContent: detail.주요내용,
    },
    existingBody: existingBill,
  });
  const { proposalReason, mainContent } = evidenceResult;

  const quickAnalysis = await scorer.analyzeBillQuick({
    billName,
    committee,
    proposerName,
    proposerParty,
    proposalReason,
    mainContent,
    industryName: profile.name,
    industryContext: profile.llmContext,
    industryKeywords: profile.keywords ?? [],
    evidence: evidenceResult.evidence,
  });

  const proposalDate = parseKstDate(input.proposalDate);
  const [billRow] = await db
    .insert(bill)
    .values({
      billId: input.billId,
      billNumber,
      billName,
      proposerName,
      proposerParty,
      coSponsorCount: detail.공동발의자_총수 ?? 0,
      committee,
      stage: stageFromSimsa(detail.심사경과),
      proposalDate,
      relevanceScore: quickAnalysis.score,
      relevanceReasoning: quickAnalysis.reasoning,
      proposalReason,
      mainContent,
      evidenceLevel: evidenceResult.evidence.level,
      bodyFetchStatus: evidenceResult.evidence.bodyFetchStatus,
      evidenceMeta: evidenceResult.evidence,
      summaryText: quickAnalysis.summary,
      externalLink: detail.LINK_URL,
      lastSynced: new Date(),
    })
    .onConflictDoUpdate({
      target: bill.billId,
      set: {
        billNumber: sql`coalesce(excluded.bill_number, ${bill.billNumber})`,
        billName,
        proposerName,
        proposerParty,
        coSponsorCount: detail.공동발의자_총수 ?? 0,
        committee,
        stage: stageFromSimsa(detail.심사경과),
        proposalDate,
        relevanceScore: quickAnalysis.score,
        relevanceReasoning: quickAnalysis.reasoning,
        proposalReason: sql`coalesce(excluded.proposal_reason, ${bill.proposalReason})`,
        mainContent: sql`coalesce(excluded.main_content, ${bill.mainContent})`,
        evidenceLevel: sql`excluded.evidence_level`,
        bodyFetchStatus: sql`excluded.body_fetch_status`,
        evidenceMeta: sql`excluded.evidence_meta`,
        summaryText: quickAnalysis.summary,
        externalLink: sql`coalesce(excluded.external_link, ${bill.externalLink})`,
        lastSynced: new Date(),
      },
    })
    .returning({
      id: bill.id,
      billId: bill.billId,
    });

  await db
    .insert(industryBillWatch)
    .values({
      industryProfileId: profile.id,
      billId: input.billId,
      addedFrom: "search",
    })
    .onConflictDoNothing({
      target: [industryBillWatch.industryProfileId, industryBillWatch.billId],
    });

  await syncVotesForBillTargets([
    {
      billId: input.billId,
      simsa: detail.심사경과,
    },
  ]);

  return billRow;
}
