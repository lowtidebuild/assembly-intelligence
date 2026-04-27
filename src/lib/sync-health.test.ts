import { describe, expect, it } from "vitest";
import {
  assertSyncMetadataWithinSizeLimit,
  countDiscoverySources,
  emptyParseFailures,
  emptyStageTransitionCounts,
  metadataJsonSizeBytes,
  recordParseFailure,
} from "@/lib/sync-health";

describe("sync health helpers", () => {
  it("counts each discovery source type once per candidate", () => {
    expect(
      countDiscoverySources([
        {
          discoverySources: [
            { type: "committee", committee: "정무위원회", page: 1 },
            { type: "mixin_law", slug: "ecommerce-act", query: "전자상거래법" },
            { type: "mixin_law", slug: "ecommerce-act", query: "전자상거래법" },
          ],
        },
        {
          discoverySources: [{ type: "manual_watch" }],
        },
      ]),
    ).toEqual({
      committee: 1,
      mixin_law: 1,
      bill_name: 0,
      manual_watch: 1,
    });
  });

  it("records parse failures by operation", () => {
    const failures = emptyParseFailures();

    recordParseFailure(failures, "gemini.analyzeBillQuick");
    recordParseFailure(failures, "gemini.analyzeBillQuick");
    recordParseFailure(failures, "gemini.generateBriefing");

    expect(failures).toEqual({
      "gemini.analyzeBillQuick": 2,
      "gemini.generateBriefing": 1,
    });
  });

  it("builds empty evening transition counts", () => {
    expect(emptyStageTransitionCounts()).toEqual({
      stage_1: 0,
      stage_2: 0,
      stage_3: 0,
      stage_4: 0,
      stage_5: 0,
      stage_6: 0,
    });
  });

  it("keeps compact sync metadata below the row size guard", () => {
    const metadata = {
      aiMode: "gemini" as const,
      latencyMs: { total: 1200 },
      discovery: {
        totalListItems: 10,
        candidates: 4,
        droppedByKeyword: 6,
        droppedByLimit: 0,
        sourceCounts: { committee: 3, mixin_law: 1, manual_watch: 1 },
        errors: [],
      },
      llm: {
        usageByOperation: {
          "gemini.analyzeBillQuick": {
            calls: 4,
            promptTokens: 1000,
            outputTokens: 400,
            thoughtTokens: 0,
            totalTokens: 1400,
          },
        },
        parseFailures: {},
      },
    };

    expect(metadataJsonSizeBytes(metadata)).toBeLessThan(16 * 1024);
    expect(() => assertSyncMetadataWithinSizeLimit(metadata)).not.toThrow();
  });
});
