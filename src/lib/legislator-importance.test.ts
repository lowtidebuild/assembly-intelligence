import { describe, expect, it } from "vitest";
import {
  importanceLevelFor,
  makeProposerKey,
} from "@/lib/legislator-importance";

describe("importanceLevelFor", () => {
  it("marks manual watch as S", () => {
    expect(
      importanceLevelFor({
        isManualWatch: true,
        isOnRelevantCommittee: false,
        sponsoredBillCount: 0,
        committeeRole: null,
      }),
    ).toBe("S");
  });

  it("marks relevant committee + two sponsored bills as S", () => {
    expect(
      importanceLevelFor({
        isManualWatch: false,
        isOnRelevantCommittee: true,
        sponsoredBillCount: 2,
        committeeRole: "위원",
      }),
    ).toBe("S");
  });

  it("marks leadership on a relevant committee as A", () => {
    expect(
      importanceLevelFor({
        isManualWatch: false,
        isOnRelevantCommittee: true,
        sponsoredBillCount: 0,
        committeeRole: "간사",
      }),
    ).toBe("A");
  });

  it("marks non-committee sponsored activity as B", () => {
    expect(
      importanceLevelFor({
        isManualWatch: false,
        isOnRelevantCommittee: false,
        sponsoredBillCount: 1,
        committeeRole: null,
      }),
    ).toBe("B");
  });

  it("returns null when no signal exists", () => {
    expect(
      importanceLevelFor({
        isManualWatch: false,
        isOnRelevantCommittee: false,
        sponsoredBillCount: 0,
        committeeRole: null,
      }),
    ).toBeNull();
  });
});

describe("makeProposerKey", () => {
  it("normalizes null party into an empty suffix", () => {
    expect(makeProposerKey("진종오", null)).toBe("진종오::");
    expect(makeProposerKey("진종오", "국민의힘")).toBe("진종오::국민의힘");
  });
});
