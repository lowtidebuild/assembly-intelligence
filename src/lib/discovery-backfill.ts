import { evaluateKeywordRelevance } from "@/lib/keyword-relevance";
import type { DiscoverySource } from "@/services/candidate-discovery";

export interface BackfillBillInput {
  billId: string;
  billName: string;
  committee: string | null;
  discoverySources: DiscoverySource[] | null;
  discoveryKeywords: string[] | null;
}

export interface BackfillProfileInput {
  keywords: string[];
  excludeKeywords: string[];
  effectiveCommittees: string[];
}

export interface DiscoveryBackfillDecision {
  billId: string;
  discoverySources: DiscoverySource[];
  discoveryKeywords: string[];
  inferredSource: InferredLegacySourceType;
  shouldUpdate: boolean;
}

type InferredLegacySourceType = "manual_watch" | "committee" | null;

export interface DiscoveryBackfillSummary {
  totalBills: number;
  updateCandidates: number;
  sourceBackfilled: number;
  keywordBackfilled: number;
  watchedInferred: number;
  committeeInferred: number;
  noSource: number;
  sourceCoveragePct: number;
}

export function buildDiscoveryBackfillDecision(input: {
  bill: BackfillBillInput;
  profile: BackfillProfileInput;
  isWatched: boolean;
}): DiscoveryBackfillDecision {
  const existingSources = normalizeSources(input.bill.discoverySources);
  const existingKeywords = normalizeKeywords(input.bill.discoveryKeywords);
  const computedKeywords = evaluateKeywordRelevance({
    text: input.bill.billName,
    includeKeywords: input.profile.keywords,
    excludeKeywords: input.profile.excludeKeywords,
    defaultWhenEmpty: false,
  }).matchedIncludeKeywords;

  const inferredSource = inferLegacySource({
    committee: input.bill.committee,
    isWatched: input.isWatched,
    effectiveCommittees: input.profile.effectiveCommittees,
  });
  const nextSources =
    existingSources.length > 0
      ? existingSources
      : inferredSource
        ? [inferredSource]
        : [];
  const nextKeywords =
    existingKeywords.length > 0 ? existingKeywords : computedKeywords;

  return {
    billId: input.bill.billId,
    discoverySources: nextSources,
    discoveryKeywords: nextKeywords,
    inferredSource: inferredSourceType(inferredSource),
    shouldUpdate:
      (existingSources.length === 0 && nextSources.length > 0) ||
      (existingKeywords.length === 0 && nextKeywords.length > 0),
  };
}

function inferredSourceType(
  source: DiscoverySource | null,
): InferredLegacySourceType {
  if (source?.type === "manual_watch" || source?.type === "committee") {
    return source.type;
  }
  return null;
}

export function summarizeDiscoveryBackfill(
  decisions: DiscoveryBackfillDecision[],
): DiscoveryBackfillSummary {
  const sourceBackfilled = decisions.filter(
    (decision) => decision.discoverySources.length > 0,
  ).length;
  const keywordBackfilled = decisions.filter(
    (decision) => decision.discoveryKeywords.length > 0,
  ).length;
  const updateCandidates = decisions.filter((decision) => decision.shouldUpdate)
    .length;
  const watchedInferred = decisions.filter(
    (decision) => decision.inferredSource === "manual_watch",
  ).length;
  const committeeInferred = decisions.filter(
    (decision) => decision.inferredSource === "committee",
  ).length;
  const noSource = decisions.length - sourceBackfilled;

  return {
    totalBills: decisions.length,
    updateCandidates,
    sourceBackfilled,
    keywordBackfilled,
    watchedInferred,
    committeeInferred,
    noSource,
    sourceCoveragePct:
      decisions.length === 0
        ? 0
        : Math.round((sourceBackfilled / decisions.length) * 1000) / 10,
  };
}

function inferLegacySource(input: {
  committee: string | null;
  isWatched: boolean;
  effectiveCommittees: string[];
}): DiscoverySource | null {
  if (input.isWatched) {
    return { type: "manual_watch", inferred: true };
  }

  if (
    input.committee &&
    input.effectiveCommittees.includes(input.committee)
  ) {
    return {
      type: "committee",
      committee: input.committee,
      page: 0,
      inferred: true,
    };
  }

  return null;
}

function normalizeSources(
  sources: DiscoverySource[] | null | undefined,
): DiscoverySource[] {
  return Array.isArray(sources) ? sources : [];
}

function normalizeKeywords(keywords: string[] | null | undefined): string[] {
  return Array.isArray(keywords)
    ? Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)))
    : [];
}
