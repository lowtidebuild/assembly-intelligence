import { describe, expect, it } from "vitest";
import { evaluateKeywordRelevance } from "@/lib/keyword-relevance";
import {
  mergeCommitteesWithMixins,
  mergeExcludesWithMixins,
  mergeKeywordsWithMixins,
} from "@/lib/law-mixins";
import {
  hasPlenarySignal,
  noticeIsRelevant,
  parseVoteResult,
  stageFromSimsa,
  textIsRelevant,
} from "@/services/sync";

function makeSimsa(
  overrides: Partial<Exclude<Parameters<typeof stageFromSimsa>[0], undefined>>,
): Exclude<Parameters<typeof stageFromSimsa>[0], undefined> {
  return {
    소관위원회: null,
    소관위_회부일: null,
    소관위_상정일: null,
    소관위_처리일: null,
    소관위_처리결과: null,
    법사위_회부일: null,
    법사위_상정일: null,
    법사위_처리일: null,
    법사위_처리결과: null,
    본회의_상정일: null,
    본회의_의결일: null,
    본회의_결과: null,
    정부이송일: null,
    공포일: null,
    공포번호: null,
    ...overrides,
  };
}

describe("stageFromSimsa", () => {
  it("returns promulgated stage when 공포일 exists", () => {
    expect(stageFromSimsa(makeSimsa({ 공포일: "2026-04-13" }))).toBe("stage_6");
  });

  it("returns judiciary committee stage when 법사위 회부 exists", () => {
    expect(stageFromSimsa(makeSimsa({ 법사위_회부일: "2026-04-13" }))).toBe("stage_3");
  });

  it("falls back to filed stage when nothing is present", () => {
    expect(stageFromSimsa(undefined)).toBe("stage_1");
    expect(stageFromSimsa(makeSimsa({}))).toBe("stage_1");
  });
});

describe("noticeIsRelevant", () => {
  it("matches keywords case-insensitively", () => {
    expect(
      noticeIsRelevant("게임산업진흥에 관한 법률 일부개정법률안", ["게임산업"]),
    ).toBe(true);
    expect(
      noticeIsRelevant("Game Industry Promotion Act", ["game industry"]),
    ).toBe(true);
  });

  it("suppresses false positives when excluded phrases match", () => {
    expect(
      noticeIsRelevant("제로섬 게임 구조 개선에 관한 토론회", ["게임"], [
        "제로섬 게임",
      ]),
    ).toBe(false);
  });

  it("returns false when keyword list is empty or unmatched", () => {
    expect(noticeIsRelevant("게임산업진흥법", [])).toBe(false);
    expect(noticeIsRelevant("방송통신발전법", ["게임"])).toBe(false);
  });
});

describe("textIsRelevant", () => {
  it("matches petition or press text by keyword", () => {
    expect(textIsRelevant("전자상거래 소비자보호 관련 청원", ["전자상거래"])).toBe(
      true,
    );
    expect(textIsRelevant("게임업계 관련 공식 보도자료", ["게임"])).toBe(true);
  });

  it("suppresses excluded keyword phrases", () => {
    expect(
      textIsRelevant("이번 보고서는 제로섬 게임 구조를 설명합니다.", ["게임"], [
        "제로섬 게임",
      ]),
    ).toBe(false);
  });

  it("returns false for empty text or unmatched keywords", () => {
    expect(textIsRelevant(null, ["게임"])).toBe(false);
    expect(textIsRelevant("보도자료", ["전자상거래"])).toBe(false);
  });
});

describe("parseVoteResult", () => {
  it("maps Korean vote labels to the enum", () => {
    expect(parseVoteResult("찬성")).toBe("yes");
    expect(parseVoteResult("반대")).toBe("no");
    expect(parseVoteResult("기권")).toBe("abstain");
    expect(parseVoteResult("불참")).toBe("absent");
  });

  it("falls back to unknown for empty or unsupported values", () => {
    expect(parseVoteResult(null)).toBe("unknown");
    expect(parseVoteResult("보류")).toBe("unknown");
  });
});

describe("hasPlenarySignal", () => {
  it("detects plenary-stage bills from 본회의 metadata", () => {
    expect(hasPlenarySignal(makeSimsa({ 본회의_상정일: "2026-04-13" }))).toBe(
      true,
    );
    expect(hasPlenarySignal(makeSimsa({ 본회의_결과: "원안가결" }))).toBe(true);
    expect(hasPlenarySignal(makeSimsa({}))).toBe(false);
  });
});

describe("sync pre-filter merge", () => {
  it("preserves the pre-feature keyword set when no mixins are selected", () => {
    const keywords = ["게임", "게임산업"];
    expect(new Set(mergeKeywordsWithMixins(keywords, []))).toEqual(
      new Set(keywords),
    );
  });

  it("preserves the pre-feature exclude set when no mixins are selected", () => {
    const excludes = ["제로섬 게임", "치킨게임"];
    expect(new Set(mergeExcludesWithMixins(excludes, []))).toEqual(
      new Set(excludes),
    );
  });

  it("merges mixin keywords into the profile keyword set", () => {
    const merged = mergeKeywordsWithMixins(["게임", "게임산업"], [
      "ecommerce-act",
    ]);
    expect(merged).toContain("게임");
    expect(merged).toContain("전자상거래");
  });

  it("does not throw on unknown mixin slugs", () => {
    expect(() =>
      mergeKeywordsWithMixins(["게임"], ["no-such-act"]),
    ).not.toThrow();
  });

  it("matches a law-mixin bill for a game profile with ecommerce selected", () => {
    const result = evaluateKeywordRelevance({
      text: "전자상거래 등에서의 소비자보호에 관한 법률 일부개정법률안 (다크패턴 규제 강화)",
      includeKeywords: mergeKeywordsWithMixins(["게임", "게임산업"], [
        "ecommerce-act",
      ]),
      excludeKeywords: [],
    });

    expect(result.isRelevant).toBe(true);
    expect(result.matchedIncludeKeywords.length).toBeGreaterThan(0);
  });

  it("does not match a bill outside both the preset and selected mixins", () => {
    const result = evaluateKeywordRelevance({
      text: "농업 지원에 관한 특별법안",
      includeKeywords: mergeKeywordsWithMixins(["게임산업"], ["ecommerce-act"]),
      excludeKeywords: [],
    });

    expect(result.isRelevant).toBe(false);
  });
});

describe("sync committee fetch pool", () => {
  it("keeps the existing committee fetch pool when no mixins are selected", () => {
    const result = mergeCommitteesWithMixins(
      [
        "문화체육관광위원회",
        "과학기술정보방송통신위원회",
        "여성가족위원회",
        "법제사법위원회",
      ],
      [],
    );

    expect(new Set(result)).toEqual(
      new Set([
        "문화체육관광위원회",
        "과학기술정보방송통신위원회",
        "여성가족위원회",
        "법제사법위원회",
      ]),
    );
  });

  it("adds 정무위원회 to the fetch pool when ecommerce-act is selected", () => {
    const result = mergeCommitteesWithMixins(
      [
        "문화체육관광위원회",
        "과학기술정보방송통신위원회",
        "여성가족위원회",
        "법제사법위원회",
      ],
      ["ecommerce-act"],
    );

    expect(result).toContain("정무위원회");
  });

  it("does not duplicate fetch targets when multiple mixins resolve to the same committee", () => {
    const result = mergeCommitteesWithMixins(
      [
        "문화체육관광위원회",
        "과학기술정보방송통신위원회",
        "여성가족위원회",
        "법제사법위원회",
      ],
      ["ecommerce-act", "fair-labeling-act"],
    );

    expect(result.filter((committee) => committee === "정무위원회")).toHaveLength(
      1,
    );
  });

  it("remains industry-agnostic for multi-committee mixins", () => {
    const result = mergeCommitteesWithMixins(
      [
        "보건복지위원회",
        "산업통상자원중소벤처기업위원회",
        "과학기술정보방송통신위원회",
        "법제사법위원회",
      ],
      ["pipa"],
    );

    expect(result).toContain("보건복지위원회");
    expect(result).toContain("정무위원회");
    expect(result).toContain("행정안전위원회");
  });
});
