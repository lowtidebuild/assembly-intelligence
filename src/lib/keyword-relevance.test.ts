import { describe, expect, it } from "vitest";
import {
  evaluateKeywordRelevance,
  findRelevantIncludeKeywords,
} from "@/lib/keyword-relevance";

describe("evaluateKeywordRelevance", () => {
  it("returns relevant when include keywords match and excludes do not", () => {
    expect(
      evaluateKeywordRelevance({
        text: "게임산업 진흥과 확률형 아이템 규제를 다룹니다.",
        includeKeywords: ["게임", "확률형 아이템"],
        excludeKeywords: ["제로섬 게임"],
      }),
    ).toMatchObject({
      isRelevant: true,
      matchedIncludeKeywords: ["게임", "확률형 아이템"],
      matchedExcludeKeywords: [],
    });
  });

  it("suppresses relevance when an excluded phrase matches", () => {
    expect(
      evaluateKeywordRelevance({
        text: "제로섬 게임 이론에 관한 발표입니다.",
        includeKeywords: ["게임"],
        excludeKeywords: ["제로섬 게임", "게임이론"],
      }),
    ).toMatchObject({
      isRelevant: false,
      matchedIncludeKeywords: ["게임"],
      matchedExcludeKeywords: ["제로섬 게임"],
    });
  });
});

describe("findRelevantIncludeKeywords", () => {
  it("returns only include keywords when the text remains relevant", () => {
    expect(
      findRelevantIncludeKeywords(
        "전자상거래와 게임 결제 시스템을 함께 논의합니다.",
        ["전자상거래", "게임"],
        ["제로섬 게임"],
      ),
    ).toEqual(["전자상거래", "게임"]);
  });

  it("returns an empty list when exclude keywords suppress the hit", () => {
    expect(
      findRelevantIncludeKeywords(
        "제로섬 게임 구조와 반복게임 전략을 설명합니다.",
        ["게임"],
        ["제로섬 게임", "반복게임"],
      ),
    ).toEqual([]);
  });
});
