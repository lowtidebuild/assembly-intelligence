import { describe, expect, it } from "vitest";
import {
  buildAnalysisCacheKey,
  QUICK_ANALYSIS_PROMPT_VERSION,
} from "@/lib/analysis-cache-key";

describe("buildAnalysisCacheKey", () => {
  it("changes when the prompt version changes", () => {
    const base = {
      billId: "PRC_1",
      bodyHash: "body-a",
      activeProfileUpdatedAt: "2026-04-27T00:00:00.000Z",
    };

    expect(
      buildAnalysisCacheKey({
        ...base,
        promptVersion: QUICK_ANALYSIS_PROMPT_VERSION,
      }),
    ).not.toBe(
      buildAnalysisCacheKey({
        ...base,
        promptVersion: "quick-analysis-v2",
      }),
    );
  });

  it("changes when bill body or active profile changes", () => {
    const base = {
      billId: "PRC_1",
      bodyHash: "body-a",
      activeProfileUpdatedAt: "2026-04-27T00:00:00.000Z",
      promptVersion: QUICK_ANALYSIS_PROMPT_VERSION,
    };

    expect(buildAnalysisCacheKey(base)).not.toBe(
      buildAnalysisCacheKey({ ...base, bodyHash: "body-b" }),
    );
    expect(buildAnalysisCacheKey(base)).not.toBe(
      buildAnalysisCacheKey({
        ...base,
        activeProfileUpdatedAt: "2026-04-28T00:00:00.000Z",
      }),
    );
  });

  it("uses stable placeholders for missing body/profile inputs", () => {
    expect(
      buildAnalysisCacheKey({
        billId: "PRC_1",
        bodyHash: null,
        activeProfileUpdatedAt: null,
        promptVersion: QUICK_ANALYSIS_PROMPT_VERSION,
      }),
    ).toBe("quick-analysis-v1:PRC_1:no-body:unknown-profile");
  });
});
