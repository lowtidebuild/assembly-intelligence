import { errorMessage } from "@/lib/api-base";
import { evaluateKeywordRelevance } from "@/lib/keyword-relevance";
import { getMixin } from "@/lib/law-mixins";
import { callMcpToolOrThrow } from "@/lib/mcp-client";

const CURRENT_ASSEMBLY_AGE = 22;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES_PER_COMMITTEE = 2;
const DEFAULT_MAX_MIXIN_QUERIES = 16;

/** `assembly_bill` search mode — list item. */
export interface McpBillListItem {
  의안ID: string;
  의안번호: string;
  의안명: string;
  제안자: string | null;
  제안자구분: string | null;
  대수: string | null;
  소관위원회: string | null;
  제안일: string | null;
  처리상태: string | null;
  처리일: string | null;
  상세링크: string | null;
  대표발의자: string | null;
  공동발의자: string | null;
}

interface McpBillListResponse {
  total?: number;
  items?: McpBillListItem[];
}

export type BillListFetcher = (
  args: Record<string, unknown>,
) => Promise<McpBillListResponse>;

export type DiscoverySource =
  | {
      type: "committee";
      committee: string | null;
      page: number;
      inferred?: boolean;
    }
  | {
      type: "mixin_law";
      slug: string;
      query: string;
      inferred?: boolean;
    }
  | {
      type: "bill_name";
      query: string;
      inferred?: boolean;
    }
  | {
      type: "manual_watch";
      inferred?: boolean;
    };

export interface DiscoveredBillCandidate {
  listItem: McpBillListItem;
  discoverySources: DiscoverySource[];
  discoveryKeywords: string[];
}

export interface DiscoverBillCandidatesInput {
  committeeCodes: string[];
  keywords: string[];
  excludeKeywords?: string[];
  mixinSlugs?: string[];
  pageSize?: number;
  maxPagesPerCommittee?: number;
  maxMixinQueries?: number;
  candidateCutoffDays?: number;
  maxCandidates?: number;
  fetchBillList?: BillListFetcher;
}

export interface DiscoverBillCandidatesResult {
  candidates: DiscoveredBillCandidate[];
  totalListItems: number;
  droppedByKeyword: number;
  droppedByLimit: number;
  errors: string[];
  sourceCounts: Record<DiscoverySource["type"], number>;
}

interface CandidateAccumulator {
  listItem: McpBillListItem;
  discoverySources: DiscoverySource[];
}

interface MixinBillNameQuery {
  slug: string;
  query: string;
}

export function buildMixinBillNameQueries(
  mixinSlugs: readonly string[],
  maxQueries = DEFAULT_MAX_MIXIN_QUERIES,
): MixinBillNameQuery[] {
  const queries: MixinBillNameQuery[] = [];
  const seen = new Set<string>();

  for (const slug of mixinSlugs) {
    const mixin = getMixin(slug);
    if (!mixin) continue;

    for (const query of [mixin.formalName, mixin.name]) {
      const normalized = query.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      queries.push({ slug, query: normalized });
      if (queries.length >= maxQueries) return queries;
    }
  }

  return queries;
}

export async function discoverBillCandidates(
  input: DiscoverBillCandidatesInput,
): Promise<DiscoverBillCandidatesResult> {
  const pageSize = positiveInt(input.pageSize, DEFAULT_PAGE_SIZE);
  const maxPagesPerCommittee = positiveInt(
    input.maxPagesPerCommittee,
    positiveInt(
      Number(process.env.BILL_DISCOVERY_MAX_PAGES_PER_COMMITTEE),
      DEFAULT_MAX_PAGES_PER_COMMITTEE,
    ),
  );
  const maxMixinQueries = positiveInt(
    input.maxMixinQueries,
    positiveInt(
      Number(process.env.BILL_DISCOVERY_MAX_MIXIN_QUERIES),
      DEFAULT_MAX_MIXIN_QUERIES,
    ),
  );
  const candidateCutoffDays =
    optionalPositiveInt(input.candidateCutoffDays) ??
    optionalPositiveInt(
      Number(process.env.BILL_DISCOVERY_CANDIDATE_CUTOFF_DAYS),
    );
  const maxCandidates =
    optionalPositiveInt(input.maxCandidates) ??
    optionalPositiveInt(Number(process.env.BILL_DISCOVERY_MAX_CANDIDATES));
  const candidateCutoffDate = candidateCutoffDays
    ? isoDateDaysAgo(candidateCutoffDays)
    : null;
  const committeeCodes = input.committeeCodes.length > 0 ? input.committeeCodes : [""];
  const excludeKeywords = input.excludeKeywords ?? [];
  const mixinSlugs = input.mixinSlugs ?? [];
  const fetchBillList = input.fetchBillList ?? defaultBillListFetcher;
  const candidatesByKey = new Map<string, CandidateAccumulator>();
  const errors: string[] = [];

  await Promise.all(
    committeeCodes.map(async (committee) => {
      for (let page = 1; page <= maxPagesPerCommittee; page++) {
        try {
          const response = await fetchBillList(
            committee
              ? {
                  committee,
                  age: CURRENT_ASSEMBLY_AGE,
                  page,
                  page_size: pageSize,
                }
              : { age: CURRENT_ASSEMBLY_AGE, page, page_size: pageSize },
          );
          const items = response.items ?? [];
          const reachedCutoff = items.some((item) =>
            isOlderThanCutoff(item.제안일, candidateCutoffDate),
          );
          for (const item of items) {
            if (isOlderThanCutoff(item.제안일, candidateCutoffDate)) continue;
            addCandidate(candidatesByKey, item, {
              type: "committee",
              committee: committee || null,
              page,
            });
          }
          if (items.length < pageSize || reachedCutoff) break;
        } catch (err) {
          errors.push(
            `assembly_bill(${committee || "all"}, page ${page}): ${errorMessage(err)}`,
          );
          break;
        }
      }
    }),
  );

  const mixinQueries = buildMixinBillNameQueries(mixinSlugs, maxMixinQueries);
  const mixinFetches = await Promise.allSettled(
    mixinQueries.map(({ query }) =>
      fetchBillList({
        bill_name: query,
        age: CURRENT_ASSEMBLY_AGE,
        page_size: pageSize,
      }),
    ),
  );

  for (let i = 0; i < mixinFetches.length; i++) {
    const result = mixinFetches[i];
    const { slug, query } = mixinQueries[i];
    if (result.status === "fulfilled") {
      for (const item of result.value.items ?? []) {
        if (isOlderThanCutoff(item.제안일, candidateCutoffDate)) continue;
        addCandidate(candidatesByKey, item, {
          type: "mixin_law",
          slug,
          query,
        });
      }
    } else {
      errors.push(`assembly_bill(bill_name="${query}"): ${errorMessage(result.reason)}`);
    }
  }

  const totalListItems = candidatesByKey.size;
  const candidates: DiscoveredBillCandidate[] = [];

  for (const candidate of candidatesByKey.values()) {
    const relevance = evaluateKeywordRelevance({
      text: candidate.listItem.의안명,
      includeKeywords: input.keywords,
      excludeKeywords,
      defaultWhenEmpty: true,
    });

    if (!relevance.isRelevant) continue;
    candidates.push({
      listItem: candidate.listItem,
      discoverySources: candidate.discoverySources,
      discoveryKeywords: relevance.matchedIncludeKeywords,
    });
  }
  const limitedCandidates = maxCandidates
    ? candidates.slice(0, maxCandidates)
    : candidates;

  return {
    candidates: limitedCandidates,
    totalListItems,
    droppedByKeyword: totalListItems - candidates.length,
    droppedByLimit: candidates.length - limitedCandidates.length,
    errors,
    sourceCounts: countSources(limitedCandidates),
  };
}

function defaultBillListFetcher(
  args: Record<string, unknown>,
): Promise<McpBillListResponse> {
  return callMcpToolOrThrow<McpBillListResponse>("assembly_bill", args);
}

function addCandidate(
  candidatesByKey: Map<string, CandidateAccumulator>,
  listItem: McpBillListItem,
  source: DiscoverySource,
): void {
  const key = listItem.의안ID || listItem.의안번호 || listItem.의안명;
  if (!key) return;

  const existing = candidatesByKey.get(key);
  if (existing) {
    existing.discoverySources.push(source);
    return;
  }

  candidatesByKey.set(key, {
    listItem,
    discoverySources: [source],
  });
}

function countSources(
  candidates: DiscoveredBillCandidate[],
): Record<DiscoverySource["type"], number> {
  const counts: Record<DiscoverySource["type"], number> = {
    committee: 0,
    mixin_law: 0,
    bill_name: 0,
    manual_watch: 0,
  };

  for (const candidate of candidates) {
    const sourceTypes = new Set(
      candidate.discoverySources.map((source) => source.type),
    );
    for (const type of sourceTypes) {
      counts[type] += 1;
    }
  }

  return counts;
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function optionalPositiveInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function isOlderThanCutoff(
  proposalDate: string | null,
  cutoffDate: string | null,
): boolean {
  if (!proposalDate || !cutoffDate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposalDate)) return false;
  return proposalDate < cutoffDate;
}
