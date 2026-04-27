import type { BillAnalysisMeta } from "@/lib/sync-health";
import type { DiscoverySource } from "@/services/candidate-discovery";

export interface DetectionExplainabilityInput {
  discoverySources: DiscoverySource[] | null | undefined;
  discoveryKeywords: string[] | null | undefined;
  analysisMeta: BillAnalysisMeta | null | undefined;
}

export interface DiscoverySourceDisplay {
  label: string;
  inferred: boolean;
}

export const CONFIDENCE_LABELS: Record<BillAnalysisMeta["confidence"], string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

export function buildDetectionExplainability(
  input: DetectionExplainabilityInput,
) {
  const sources = uniqueSourceDisplays(
    normalizeSources(input.discoverySources).map(formatDiscoverySource),
  );
  const discoveryKeywords = normalizeTerms(input.discoveryKeywords);
  const analysisKeywords = normalizeTerms(input.analysisMeta?.analysisKeywords);
  const unknowns = normalizeTerms(input.analysisMeta?.unknowns);
  const confidence = input.analysisMeta?.confidence
    ? CONFIDENCE_LABELS[input.analysisMeta.confidence]
    : null;

  return {
    sources,
    discoveryKeywords,
    analysisKeywords,
    unknowns,
    confidence,
    quickAnalysisVersion: input.analysisMeta?.quickAnalysisVersion ?? null,
    hasMetadata:
      sources.length > 0 ||
      discoveryKeywords.length > 0 ||
      analysisKeywords.length > 0 ||
      unknowns.length > 0 ||
      confidence !== null,
  };
}

function uniqueSourceDisplays(
  sources: DiscoverySourceDisplay[],
): DiscoverySourceDisplay[] {
  const seen = new Set<string>();
  const unique: DiscoverySourceDisplay[] = [];

  for (const source of sources) {
    if (seen.has(source.label)) continue;
    seen.add(source.label);
    unique.push(source);
  }

  return unique;
}

export function formatDiscoverySource(
  source: DiscoverySource,
): DiscoverySourceDisplay {
  const label = formatDiscoverySourceLabel(source);
  return {
    label: source.inferred ? `${label} (추정)` : label,
    inferred: source.inferred === true,
  };
}

export function normalizeTerms(
  terms: readonly string[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const term of terms ?? []) {
    const value = term.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeSources(
  sources: readonly DiscoverySource[] | null | undefined,
): DiscoverySource[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter((source): source is DiscoverySource => {
    return source !== null && typeof source === "object" && "type" in source;
  });
}

function formatDiscoverySourceLabel(source: DiscoverySource): string {
  switch (source.type) {
    case "committee":
      return formatCommitteeSource(source.committee, source.page);
    case "mixin_law":
      return `법률명 검색 · ${source.query}`;
    case "bill_name":
      return `의안명 검색 · ${source.query}`;
    case "manual_watch":
      return "수동 watch";
  }
}

function formatCommitteeSource(committee: string | null, page: number): string {
  const committeeLabel = committee ?? "전체";
  if (page > 0) return `위원회 목록 · ${committeeLabel} p${page}`;
  return `위원회 목록 · ${committeeLabel} 소속`;
}
