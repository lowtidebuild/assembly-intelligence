import { z } from "zod";
import type { BodyFetchStatus, EvidenceLevel } from "@/lib/evidence";
import type { GeminiUsageStats } from "@/lib/gemini-client";
import type { SyncQualityMetadata } from "@/lib/sync-health";

export type SyncLogStatus = "success" | "partial" | "failed" | string;

export interface SyncHealthLogRow {
  id: number;
  syncType: "morning" | "evening" | "manual" | string;
  status: SyncLogStatus;
  startedAt: Date;
  completedAt: Date | null;
  billsProcessed: number;
  billsScored: number;
  legislatorsUpdated: number;
  newsFetched: number;
  errorsJson: unknown;
  metadataJson: SyncQualityMetadata | null;
}

export interface SyncHealthRecentError {
  id: number;
  syncType: string;
  status: SyncLogStatus;
  startedAt: Date;
  messages: string[];
}

export interface SyncHealthSummary {
  latestMorning: SyncHealthLogRow | null;
  latestEvening: SyncHealthLogRow | null;
  statusCounts: Record<"success" | "partial" | "failed", number>;
  discovery: {
    totalListItems: number;
    candidates: number;
    droppedByKeyword: number;
    droppedByLimit: number;
    scoredBills: number;
  };
  sourceCounts: Record<string, number>;
  evidenceLevelCounts: Record<EvidenceLevel, number>;
  bodyFetchStatusCounts: Record<BodyFetchStatus, number>;
  bodyFetchFailed: number;
  llmUsageByOperation: Record<string, GeminiUsageStats>;
  llmTotals: GeminiUsageStats;
  parseFailures: Record<string, number>;
  recentErrors: SyncHealthRecentError[];
}

const evidenceLevels: EvidenceLevel[] = [
  "title_only",
  "metadata",
  "body",
  "body_with_references",
];

const bodyFetchStatuses: BodyFetchStatus[] = [
  "not_attempted",
  "from_mcp_detail",
  "from_existing_db",
  "fetched",
  "empty",
  "failed",
];

const metadataRecordSchema = z.record(z.string(), z.unknown());

export function normalizeSyncQualityMetadata(
  value: unknown,
): SyncQualityMetadata | null {
  if (value === null || value === undefined) return null;

  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  const result = metadataRecordSchema.safeParse(parsed);
  return result.success ? (result.data as SyncQualityMetadata) : null;
}

export function summarizeSyncHealth({
  recentRows,
  windowRows,
}: {
  recentRows: SyncHealthLogRow[];
  windowRows: SyncHealthLogRow[];
}): SyncHealthSummary {
  const statusCounts = { success: 0, partial: 0, failed: 0 };
  const discovery = {
    totalListItems: 0,
    candidates: 0,
    droppedByKeyword: 0,
    droppedByLimit: 0,
    scoredBills: 0,
  };
  const sourceCounts: Record<string, number> = {};
  const evidenceLevelCounts = emptyEvidenceLevelCounts();
  const bodyFetchStatusCounts = emptyBodyFetchStatusCounts();
  const llmUsageByOperation: Record<string, GeminiUsageStats> = {};
  const parseFailures: Record<string, number> = {};

  for (const row of windowRows) {
    if (row.status === "success" || row.status === "partial" || row.status === "failed") {
      statusCounts[row.status] += 1;
    }

    const metadata = row.metadataJson;
    if (!metadata) continue;

    if (metadata.discovery) {
      discovery.totalListItems += numberOrZero(metadata.discovery.totalListItems);
      discovery.candidates += numberOrZero(metadata.discovery.candidates);
      discovery.droppedByKeyword += numberOrZero(metadata.discovery.droppedByKeyword);
      discovery.droppedByLimit += numberOrZero(metadata.discovery.droppedByLimit);
      for (const [source, count] of Object.entries(metadata.discovery.sourceCounts ?? {})) {
        sourceCounts[source] = (sourceCounts[source] ?? 0) + numberOrZero(count);
      }
    }

    discovery.scoredBills += row.syncType === "morning" ? row.billsScored : 0;

    if (metadata.evidence) {
      for (const level of evidenceLevels) {
        evidenceLevelCounts[level] += numberOrZero(
          metadata.evidence.evidenceLevelCounts?.[level],
        );
      }
      for (const status of bodyFetchStatuses) {
        bodyFetchStatusCounts[status] += numberOrZero(
          metadata.evidence.bodyFetchStatusCounts?.[status],
        );
      }
    }

    for (const [operation, usage] of Object.entries(
      metadata.llm?.usageByOperation ?? {},
    )) {
      addUsage(llmUsageByOperation, operation, usage);
    }

    for (const [operation, count] of Object.entries(
      metadata.llm?.parseFailures ?? {},
    )) {
      parseFailures[operation] =
        (parseFailures[operation] ?? 0) + numberOrZero(count);
    }
  }

  return {
    latestMorning: recentRows.find((row) => row.syncType === "morning") ?? null,
    latestEvening: recentRows.find((row) => row.syncType === "evening") ?? null,
    statusCounts,
    discovery,
    sourceCounts,
    evidenceLevelCounts,
    bodyFetchStatusCounts,
    bodyFetchFailed: bodyFetchStatusCounts.failed,
    llmUsageByOperation,
    llmTotals: totalUsage(llmUsageByOperation),
    parseFailures,
    recentErrors: collectRecentErrors(recentRows),
  };
}

export function syncDurationMs(row: SyncHealthLogRow): number | null {
  if (row.metadataJson?.latencyMs?.total !== undefined) {
    return row.metadataJson.latencyMs.total;
  }
  if (!row.completedAt) return null;
  return Math.max(0, row.completedAt.getTime() - row.startedAt.getTime());
}

function collectRecentErrors(rows: SyncHealthLogRow[]): SyncHealthRecentError[] {
  const entries: SyncHealthRecentError[] = [];

  for (const row of rows) {
    const messages = [
      ...extractErrorMessages(row.errorsJson),
      ...(row.metadataJson?.discovery?.errors ?? []),
      ...formatParseFailureMessages(row.metadataJson?.llm?.parseFailures),
    ].filter((message, index, all) => all.indexOf(message) === index);

    if (row.status === "failed" || row.status === "partial" || messages.length > 0) {
      entries.push({
        id: row.id,
        syncType: row.syncType,
        status: row.status,
        startedAt: row.startedAt,
        messages: messages.length > 0 ? messages : [`status=${row.status}`],
      });
    }
  }

  return entries.slice(0, 8);
}

function extractErrorMessages(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    try {
      return extractErrorMessages(JSON.parse(value));
    } catch {
      return [value];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractErrorMessages(item));
  }

  if (value instanceof Error) {
    return [value.message];
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") return [record.message];
    if (typeof record.error === "string") return [record.error];
    return [JSON.stringify(record)];
  }

  return [String(value)];
}

function formatParseFailureMessages(
  failures: Record<string, number> | undefined,
): string[] {
  return Object.entries(failures ?? {})
    .filter(([, count]) => numberOrZero(count) > 0)
    .map(([operation, count]) => `${operation} parse failure ${count}`);
}

function emptyEvidenceLevelCounts(): Record<EvidenceLevel, number> {
  return {
    title_only: 0,
    metadata: 0,
    body: 0,
    body_with_references: 0,
  };
}

function emptyBodyFetchStatusCounts(): Record<BodyFetchStatus, number> {
  return {
    not_attempted: 0,
    from_mcp_detail: 0,
    from_existing_db: 0,
    fetched: 0,
    empty: 0,
    failed: 0,
  };
}

function addUsage(
  target: Record<string, GeminiUsageStats>,
  operation: string,
  usage: Partial<GeminiUsageStats>,
) {
  const current = target[operation] ?? emptyUsage();
  target[operation] = {
    promptTokens: current.promptTokens + numberOrZero(usage.promptTokens),
    outputTokens: current.outputTokens + numberOrZero(usage.outputTokens),
    thoughtTokens: current.thoughtTokens + numberOrZero(usage.thoughtTokens),
    totalTokens: current.totalTokens + numberOrZero(usage.totalTokens),
    calls: current.calls + numberOrZero(usage.calls),
  };
}

function totalUsage(
  usageByOperation: Record<string, GeminiUsageStats>,
): GeminiUsageStats {
  return Object.values(usageByOperation).reduce((total, usage) => {
    total.promptTokens += usage.promptTokens;
    total.outputTokens += usage.outputTokens;
    total.thoughtTokens += usage.thoughtTokens;
    total.totalTokens += usage.totalTokens;
    total.calls += usage.calls;
    return total;
  }, emptyUsage());
}

function emptyUsage(): GeminiUsageStats {
  return {
    promptTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    calls: 0,
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
