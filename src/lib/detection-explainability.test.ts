import { describe, expect, it } from "vitest";
import {
  buildDetectionExplainability,
  formatDiscoverySource,
  normalizeTerms,
} from "@/lib/detection-explainability";

describe("detection explainability", () => {
  it("returns empty metadata state when all fields are missing", () => {
    const result = buildDetectionExplainability({
      discoverySources: null,
      discoveryKeywords: null,
      analysisMeta: null,
    });

    expect(result.hasMetadata).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.discoveryKeywords).toEqual([]);
  });

  it("formats inferred legacy committee sources with suffix", () => {
    expect(
      formatDiscoverySource({
        type: "committee",
        committee: "정무위원회",
        page: 0,
        inferred: true,
      }),
    ).toEqual({
      label: "위원회 목록 · 정무위원회 소속 (추정)",
      inferred: true,
    });
  });

  it("keeps discovery and analysis keywords separate", () => {
    const result = buildDetectionExplainability({
      discoverySources: [
        { type: "mixin_law", slug: "ecommerce", query: "전자상거래법" },
        { type: "manual_watch" },
      ],
      discoveryKeywords: ["전자상거래", "소비자보호"],
      analysisMeta: {
        analysisKeywords: ["환불", "청약철회"],
        confidence: "medium",
        unknowns: ["제안이유 및 주요내용 미확보"],
        quickAnalysisVersion: "quick-analysis-v1",
        analyzedAt: "2026-04-27T00:00:00.000Z",
      },
    });

    expect(result.hasMetadata).toBe(true);
    expect(result.sources.map((source) => source.label)).toEqual([
      "법률명 검색 · 전자상거래법",
      "수동 watch",
    ]);
    expect(result.discoveryKeywords).toEqual(["전자상거래", "소비자보호"]);
    expect(result.analysisKeywords).toEqual(["환불", "청약철회"]);
    expect(result.unknowns).toEqual(["제안이유 및 주요내용 미확보"]);
    expect(result.confidence).toBe("보통");
  });

  it("dedupes and trims keyword lists", () => {
    expect(normalizeTerms([" 환불 ", "", "환불", "청약철회"])).toEqual([
      "환불",
      "청약철회",
    ]);
  });
});
