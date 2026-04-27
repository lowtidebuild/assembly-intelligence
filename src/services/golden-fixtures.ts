import {
  mergeCommitteesWithMixins,
  mergeExcludesWithMixins,
  mergeKeywordsWithMixins,
} from "@/lib/law-mixins";
import { buildBillAnalysisPrompt } from "@/lib/prompts/bill-analysis";
import { buildBillQuickAnalysisPrompt } from "@/lib/prompts/bill-quick-analysis";
import {
  discoverBillCandidates,
  type BillListFetcher,
  type DiscoverySource,
  type McpBillListItem,
} from "@/services/candidate-discovery";

type FixtureHitMap = Record<string, string[] | Record<string, string[]>>;

export interface GoldenBillFixture {
  id: string;
  description: string;
  profile: {
    industryName: string;
    industryContext: string;
    committees: string[];
    keywords: string[];
    excludeKeywords: string[];
    selectedMixins: string[];
  };
  mcp: {
    bill: McpBillListItem;
    committeeHits: FixtureHitMap;
    billNameHits: FixtureHitMap;
  };
  expected: {
    candidateBillIds: string[];
    discoverySourceTypes: Array<DiscoverySource["type"]>;
    discoveryKeywords: string[];
    expectedScoreMin: number;
    expectedScoreMax: number;
    mustMention: string[];
    forbiddenWhenTitleOnly: string[];
  };
}

export interface GoldenFixtureEvaluation {
  id: string;
  candidateBillIds: string[];
  discoverySourceTypes: Array<DiscoverySource["type"]>;
  discoveryKeywords: string[];
  failures: string[];
}

export interface GoldenQuickAnalysisOutput {
  score: number;
  reasoning: string;
  summary: string;
  analysisKeywords?: string[];
  unknowns?: string[];
}

export function makeGoldenFixtureFetcher(
  fixture: GoldenBillFixture,
): BillListFetcher {
  const billsById = new Map([[fixture.mcp.bill.의안ID, fixture.mcp.bill]]);

  return async (args) => {
    const committee = typeof args.committee === "string" ? args.committee : null;
    const billName = typeof args.bill_name === "string" ? args.bill_name : null;
    const page = typeof args.page === "number" ? args.page : 1;
    const ids = committee
      ? resolveFixtureHits(fixture.mcp.committeeHits[committee], page)
      : billName
        ? resolveFixtureHits(fixture.mcp.billNameHits[billName], page)
        : [];

    return {
      total: ids.length,
      items: ids
        .map((id) => billsById.get(id))
        .filter((bill): bill is McpBillListItem => bill !== undefined),
    };
  };
}

export async function evaluateGoldenFixture(
  fixture: GoldenBillFixture,
): Promise<GoldenFixtureEvaluation> {
  const failures: string[] = [];
  validateFixtureShape(fixture, failures);

  const committeeCodes = mergeCommitteesWithMixins(
    fixture.profile.committees,
    fixture.profile.selectedMixins,
  );
  const keywords = mergeKeywordsWithMixins(
    fixture.profile.keywords,
    fixture.profile.selectedMixins,
  );
  const excludeKeywords = mergeExcludesWithMixins(
    fixture.profile.excludeKeywords,
    fixture.profile.selectedMixins,
  );

  const discovery = await discoverBillCandidates({
    committeeCodes,
    keywords,
    excludeKeywords,
    mixinSlugs: fixture.profile.selectedMixins,
    pageSize: 10,
    maxPagesPerCommittee: 2,
    fetchBillList: makeGoldenFixtureFetcher(fixture),
  });

  const candidateBillIds = discovery.candidates.map(
    (candidate) => candidate.listItem.의안ID,
  );
  if (!sameArray(candidateBillIds, fixture.expected.candidateBillIds)) {
    failures.push(
      `candidate ids mismatch: expected ${fixture.expected.candidateBillIds.join(", ")}; got ${candidateBillIds.join(", ")}`,
    );
  }

  const firstCandidate = discovery.candidates[0] ?? null;
  const discoverySourceTypes = firstCandidate
    ? Array.from(
        new Set(firstCandidate.discoverySources.map((source) => source.type)),
      )
    : [];
  if (!sameArray(discoverySourceTypes, fixture.expected.discoverySourceTypes)) {
    failures.push(
      `discovery source mismatch: expected ${fixture.expected.discoverySourceTypes.join(", ")}; got ${discoverySourceTypes.join(", ")}`,
    );
  }

  const discoveryKeywords = firstCandidate?.discoveryKeywords ?? [];
  for (const keyword of fixture.expected.discoveryKeywords) {
    if (!discoveryKeywords.includes(keyword)) {
      failures.push(`missing discovery keyword "${keyword}"`);
    }
  }

  const quickPrompt = buildBillQuickAnalysisPrompt({
    billName: fixture.mcp.bill.의안명,
    committee: fixture.mcp.bill.소관위원회,
    proposerName: fixture.mcp.bill.대표발의자 ?? "제안자 미상",
    proposerParty: null,
    proposalReason: null,
    mainContent: null,
    industryName: fixture.profile.industryName,
    industryContext: fixture.profile.industryContext,
    industryKeywords: keywords,
  });
  const deepPrompt = buildBillAnalysisPrompt({
    billName: fixture.mcp.bill.의안명,
    committee: fixture.mcp.bill.소관위원회,
    proposerName: fixture.mcp.bill.대표발의자 ?? "제안자 미상",
    proposerParty: null,
    coSponsorCount: 10,
    proposalDate: fixture.mcp.bill.제안일,
    stage: "stage_1",
    proposalReason: null,
    mainContent: null,
    industryName: fixture.profile.industryName,
    industryContext: fixture.profile.industryContext,
  });

  if (
    !quickPrompt.includes("evidenceLevel: metadata") ||
    !quickPrompt.includes('"unknowns"') ||
    !quickPrompt.includes("단정하지 말 것")
  ) {
    failures.push("quick analysis title-only guard missing");
  }
  if (
    !deepPrompt.includes("mode: limited_analysis") ||
    !deepPrompt.includes('"unknowns"') ||
    !deepPrompt.includes("단정하지 말 것")
  ) {
    failures.push("deep analysis title-only guard missing");
  }

  for (const term of fixture.expected.mustMention) {
    if (!quickPrompt.includes(term)) {
      failures.push(`quick prompt missing expected term "${term}"`);
    }
  }

  return {
    id: fixture.id,
    candidateBillIds,
    discoverySourceTypes,
    discoveryKeywords,
    failures,
  };
}

export function formatGoldenFixtureFailures(
  evaluations: GoldenFixtureEvaluation[],
): string[] {
  return evaluations.flatMap((evaluation) =>
    evaluation.failures.map((failure) => `${evaluation.id}: ${failure}`),
  );
}

export function validateGoldenQuickAnalysisOutput(
  fixture: GoldenBillFixture,
  output: GoldenQuickAnalysisOutput,
  options: { titleOnly?: boolean } = {},
): string[] {
  const failures: string[] = [];
  if (
    !Number.isInteger(output.score) ||
    output.score < fixture.expected.expectedScoreMin ||
    output.score > fixture.expected.expectedScoreMax
  ) {
    failures.push(
      `score ${output.score} outside expected range ${fixture.expected.expectedScoreMin}-${fixture.expected.expectedScoreMax}`,
    );
  }

  const joinedText = [
    output.reasoning,
    output.summary,
    ...(output.analysisKeywords ?? []),
  ].join(" ");
  for (const term of fixture.expected.mustMention) {
    if (!joinedText.includes(term)) {
      failures.push(`output missing required term "${term}"`);
    }
  }

  if (options.titleOnly) {
    for (const term of findForbiddenTitleOnlyClaims(fixture, joinedText)) {
      failures.push(`title-only output contains forbidden claim "${term}"`);
    }
    const unknownText = (output.unknowns ?? []).join(" ");
    if (!/미확보|확인 불가|본문/.test(unknownText)) {
      failures.push("title-only output missing explicit unknowns");
    }
  }

  return failures;
}

export function findForbiddenTitleOnlyClaims(
  fixture: GoldenBillFixture,
  text: string,
): string[] {
  return fixture.expected.forbiddenWhenTitleOnly.filter((term) =>
    text.includes(term),
  );
}

function validateFixtureShape(
  fixture: GoldenBillFixture,
  failures: string[],
): void {
  const { expectedScoreMin, expectedScoreMax } = fixture.expected;
  if (
    expectedScoreMin < 1 ||
    expectedScoreMax > 5 ||
    expectedScoreMin > expectedScoreMax
  ) {
    failures.push(
      `invalid expected score range ${expectedScoreMin}-${expectedScoreMax}`,
    );
  }
}

function resolveFixtureHits(
  hits: string[] | Record<string, string[]> | undefined,
  page: number,
): string[] {
  if (!hits) return [];
  if (Array.isArray(hits)) return hits;
  return hits[String(page)] ?? [];
}

function sameArray<T>(actual: T[], expected: T[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
