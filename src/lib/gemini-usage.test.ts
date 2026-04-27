import { describe, expect, it } from "vitest";
import { subtractGeminiUsageStats } from "@/lib/gemini-client";

describe("subtractGeminiUsageStats", () => {
  it("returns only invocation-local usage deltas", () => {
    expect(
      subtractGeminiUsageStats(
        {
          "gemini.analyzeBillQuick": {
            calls: 5,
            promptTokens: 500,
            outputTokens: 100,
            thoughtTokens: 0,
            totalTokens: 600,
          },
          "gemini.generateBriefing": {
            calls: 1,
            promptTokens: 200,
            outputTokens: 80,
            thoughtTokens: 20,
            totalTokens: 300,
          },
        },
        {
          "gemini.analyzeBillQuick": {
            calls: 3,
            promptTokens: 300,
            outputTokens: 60,
            thoughtTokens: 0,
            totalTokens: 360,
          },
        },
      ),
    ).toEqual({
      "gemini.analyzeBillQuick": {
        calls: 2,
        promptTokens: 200,
        outputTokens: 40,
        thoughtTokens: 0,
        totalTokens: 240,
      },
      "gemini.generateBriefing": {
        calls: 1,
        promptTokens: 200,
        outputTokens: 80,
        thoughtTokens: 20,
        totalTokens: 300,
      },
    });
  });
});
