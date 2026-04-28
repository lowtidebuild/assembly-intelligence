import type { BodyFetchStatus, EvidenceLevel } from "@/lib/evidence";
import type { GeminiUsageStats } from "@/lib/gemini-client";
import type { DiscoverySource } from "@/services/candidate-discovery";

export type SyncAiMode = "gemini" | "stub";

export type BillStageKey =
  | "stage_1"
  | "stage_2"
  | "stage_3"
  | "stage_4"
  | "stage_5"
  | "stage_6";

export interface BillAnalysisMeta {
  analysisKeywords: string[];
  confidence: "low" | "medium" | "high";
  unknowns: string[];
  quickAnalysisVersion: string;
  analyzedAt: string;
  aiMode?: SyncAiMode;
  repairedAt?: string;
  repairReason?: string;
}

export interface SyncQualityMetadata {
  aiMode?: SyncAiMode;
  latencyMs?: {
    total?: number;
    discovery?: number;
    enrichment?: number;
    quickAnalysis?: number;
    briefing?: number;
  };
  schema?: {
    checkedAt: string;
    missingColumns: Array<{ table: string; column: string }>;
  };
  discovery?: {
    totalListItems: number;
    candidates: number;
    droppedByKeyword: number;
    droppedByLimit: number;
    sourceCounts: Record<string, number>;
    errors: string[];
  };
  evidence?: {
    evidenceLevelCounts: Record<EvidenceLevel, number>;
    bodyFetchStatusCounts: Record<BodyFetchStatus, number>;
    bodyFetchFailed: number;
  };
  llm?: {
    usageByOperation: Record<string, GeminiUsageStats>;
    parseFailures?: Record<string, number>;
  };
  evening?: {
    billsChecked: number;
    stageTransitions: number;
    mcpDetailFailed: number;
    transitionsBy: Record<BillStageKey, number>;
  };
}

export const SYNC_METADATA_MAX_BYTES = 16 * 1024;

export function emptyStageTransitionCounts(): Record<BillStageKey, number> {
  return {
    stage_1: 0,
    stage_2: 0,
    stage_3: 0,
    stage_4: 0,
    stage_5: 0,
    stage_6: 0,
  };
}

export function emptyParseFailures(): Record<string, number> {
  return {};
}

export function recordParseFailure(
  failures: Record<string, number>,
  operation: string,
): void {
  failures[operation] = (failures[operation] ?? 0) + 1;
}

export function metadataJsonSizeBytes(metadata: SyncQualityMetadata): number {
  return new TextEncoder().encode(JSON.stringify(metadata)).length;
}

export function assertSyncMetadataWithinSizeLimit(
  metadata: SyncQualityMetadata,
): void {
  const size = metadataJsonSizeBytes(metadata);
  if (size > SYNC_METADATA_MAX_BYTES) {
    throw new Error(
      `sync metadata_json too large: ${size} bytes > ${SYNC_METADATA_MAX_BYTES} bytes`,
    );
  }
}

export function countDiscoverySources(
  candidates: Array<{ discoverySources: DiscoverySource[] }>,
): Record<string, number> {
  const counts: Record<string, number> = {
    committee: 0,
    mixin_law: 0,
    bill_name: 0,
    manual_watch: 0,
  };

  for (const candidate of candidates) {
    const types = new Set(candidate.discoverySources.map((source) => source.type));
    for (const type of types) {
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }

  return counts;
}

export function mergeDiscoverySources(
  existing: DiscoverySource[] | null | undefined,
  incoming: DiscoverySource[],
): DiscoverySource[] {
  const map = new Map<string, DiscoverySource>();
  for (const source of [...(existing ?? []), ...incoming]) {
    map.set(JSON.stringify(source), source);
  }
  return Array.from(map.values());
}
