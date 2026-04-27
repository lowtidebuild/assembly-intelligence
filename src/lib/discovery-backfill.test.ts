import { describe, expect, it } from "vitest";
import {
  buildDiscoveryBackfillDecision,
  summarizeDiscoveryBackfill,
} from "@/lib/discovery-backfill";

const profile = {
  keywords: ["게임", "전자상거래"],
  excludeKeywords: ["제로섬 게임"],
  effectiveCommittees: ["문화체육관광위원회", "정무위원회"],
};

describe("buildDiscoveryBackfillDecision", () => {
  it("infers manual watch sources before committee sources", () => {
    expect(
      buildDiscoveryBackfillDecision({
        profile,
        isWatched: true,
        bill: {
          billId: "PRC_1",
          billName: "게임산업진흥에 관한 법률 일부개정법률안",
          committee: "문화체육관광위원회",
          discoverySources: null,
          discoveryKeywords: null,
        },
      }),
    ).toMatchObject({
      discoverySources: [{ type: "manual_watch", inferred: true }],
      discoveryKeywords: ["게임"],
      inferredSource: "manual_watch",
      shouldUpdate: true,
    });
  });

  it("infers committee source with page 0 for legacy rows", () => {
    expect(
      buildDiscoveryBackfillDecision({
        profile,
        isWatched: false,
        bill: {
          billId: "PRC_2",
          billName: "전자상거래 등에서의 소비자보호에 관한 법률 일부개정법률안",
          committee: "정무위원회",
          discoverySources: [],
          discoveryKeywords: [],
        },
      }),
    ).toMatchObject({
      discoverySources: [
        {
          type: "committee",
          committee: "정무위원회",
          page: 0,
          inferred: true,
        },
      ],
      discoveryKeywords: ["전자상거래"],
      inferredSource: "committee",
      shouldUpdate: true,
    });
  });

  it("does not overwrite already populated metadata", () => {
    expect(
      buildDiscoveryBackfillDecision({
        profile,
        isWatched: true,
        bill: {
          billId: "PRC_3",
          billName: "게임산업진흥에 관한 법률 일부개정법률안",
          committee: "문화체육관광위원회",
          discoverySources: [
            { type: "mixin_law", slug: "ecommerce-act", query: "전자상거래법" },
          ],
          discoveryKeywords: ["게임산업"],
        },
      }),
    ).toMatchObject({
      discoverySources: [
        { type: "mixin_law", slug: "ecommerce-act", query: "전자상거래법" },
      ],
      discoveryKeywords: ["게임산업"],
      inferredSource: "manual_watch",
      shouldUpdate: false,
    });
  });

  it("leaves unrelated legacy rows without inferred source", () => {
    expect(
      buildDiscoveryBackfillDecision({
        profile,
        isWatched: false,
        bill: {
          billId: "PRC_4",
          billName: "농업 지원에 관한 특별법안",
          committee: "농림축산식품해양수산위원회",
          discoverySources: null,
          discoveryKeywords: null,
        },
      }),
    ).toMatchObject({
      discoverySources: [],
      discoveryKeywords: [],
      inferredSource: null,
      shouldUpdate: false,
    });
  });
});

describe("summarizeDiscoveryBackfill", () => {
  it("summarizes impact and coverage", () => {
    expect(
      summarizeDiscoveryBackfill([
        {
          billId: "A",
          discoverySources: [{ type: "manual_watch", inferred: true }],
          discoveryKeywords: ["게임"],
          inferredSource: "manual_watch",
          shouldUpdate: true,
        },
        {
          billId: "B",
          discoverySources: [
            {
              type: "committee",
              committee: "정무위원회",
              page: 0,
              inferred: true,
            },
          ],
          discoveryKeywords: [],
          inferredSource: "committee",
          shouldUpdate: true,
        },
        {
          billId: "C",
          discoverySources: [],
          discoveryKeywords: [],
          inferredSource: null,
          shouldUpdate: false,
        },
      ]),
    ).toEqual({
      totalBills: 3,
      updateCandidates: 2,
      sourceBackfilled: 2,
      keywordBackfilled: 1,
      watchedInferred: 1,
      committeeInferred: 1,
      noSource: 1,
      sourceCoveragePct: 66.7,
    });
  });
});
