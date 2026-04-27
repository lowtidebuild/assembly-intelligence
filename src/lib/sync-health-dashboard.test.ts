import { describe, expect, it } from "vitest";
import {
  normalizeSyncQualityMetadata,
  summarizeSyncHealth,
  syncDurationMs,
  type SyncHealthLogRow,
} from "@/lib/sync-health-dashboard";

const baseRow: SyncHealthLogRow = {
  id: 1,
  syncType: "morning",
  status: "success",
  startedAt: new Date("2026-04-27T00:00:00.000Z"),
  completedAt: new Date("2026-04-27T00:01:00.000Z"),
  billsProcessed: 5,
  billsScored: 4,
  legislatorsUpdated: 0,
  newsFetched: 0,
  errorsJson: null,
  metadataJson: null,
};

describe("sync health dashboard helpers", () => {
  it("normalizes object and JSON string metadata safely", () => {
    expect(
      normalizeSyncQualityMetadata({
        discovery: { candidates: 3 },
      })?.discovery?.candidates,
    ).toBe(3);

    expect(
      normalizeSyncQualityMetadata(
        JSON.stringify({ latencyMs: { total: 1234 } }),
      )?.latencyMs?.total,
    ).toBe(1234);

    expect(normalizeSyncQualityMetadata("{bad json")).toBeNull();
    expect(normalizeSyncQualityMetadata(["not", "object"])).toBeNull();
  });

  it("summarizes discovery, evidence, llm usage, and parse failures", () => {
    const row: SyncHealthLogRow = {
      ...baseRow,
      metadataJson: {
        discovery: {
          totalListItems: 10,
          candidates: 7,
          droppedByKeyword: 2,
          droppedByLimit: 1,
          sourceCounts: { committee: 5, mixin_law: 2 },
          errors: [],
        },
        evidence: {
          evidenceLevelCounts: {
            title_only: 1,
            metadata: 1,
            body: 1,
            body_with_references: 1,
          },
          bodyFetchStatusCounts: {
            not_attempted: 0,
            from_mcp_detail: 1,
            from_existing_db: 0,
            fetched: 2,
            empty: 0,
            failed: 1,
          },
          bodyFetchFailed: 1,
        },
        llm: {
          usageByOperation: {
            quick_analysis: {
              promptTokens: 100,
              outputTokens: 20,
              thoughtTokens: 5,
              totalTokens: 125,
              calls: 2,
            },
          },
          parseFailures: { quick_analysis: 1 },
        },
      },
    };

    const summary = summarizeSyncHealth({
      recentRows: [row],
      windowRows: [row],
    });

    expect(summary.latestMorning?.id).toBe(1);
    expect(summary.discovery).toEqual({
      totalListItems: 10,
      candidates: 7,
      droppedByKeyword: 2,
      droppedByLimit: 1,
      scoredBills: 4,
    });
    expect(summary.sourceCounts).toEqual({ committee: 5, mixin_law: 2 });
    expect(summary.evidenceLevelCounts.body_with_references).toBe(1);
    expect(summary.bodyFetchFailed).toBe(1);
    expect(summary.llmTotals.totalTokens).toBe(125);
    expect(summary.parseFailures.quick_analysis).toBe(1);
  });

  it("collects recent partial and failed rows as operational errors", () => {
    const row: SyncHealthLogRow = {
      ...baseRow,
      status: "partial",
      errorsJson: ["MCP detail failed"],
      metadataJson: {
        llm: {
          usageByOperation: {},
          parseFailures: { briefing: 2 },
        },
      },
    };

    const summary = summarizeSyncHealth({
      recentRows: [row],
      windowRows: [row],
    });

    expect(summary.statusCounts.partial).toBe(1);
    expect(summary.recentErrors[0]?.messages).toEqual([
      "MCP detail failed",
      "briefing parse failure 2",
    ]);
  });

  it("uses metadata latency before completed-started duration", () => {
    expect(
      syncDurationMs({
        ...baseRow,
        metadataJson: { latencyMs: { total: 500 } },
      }),
    ).toBe(500);

    expect(syncDurationMs(baseRow)).toBe(60_000);
  });
});
