import { describe, expect, it } from "vitest";
import { noticeIsRelevant, stageFromSimsa } from "@/services/sync";

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

  it("returns false when keyword list is empty or unmatched", () => {
    expect(noticeIsRelevant("게임산업진흥법", [])).toBe(false);
    expect(noticeIsRelevant("방송통신발전법", ["게임"])).toBe(false);
  });
});
