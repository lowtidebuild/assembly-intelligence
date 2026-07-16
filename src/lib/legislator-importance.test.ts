import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
  },
}));

import {
  computeImportance,
  importanceLevelFor,
  makeProposerKey,
} from "@/lib/legislator-importance";

beforeEach(() => {
  selectMock.mockReset();
});

function importanceQuery(result: Promise<unknown>) {
  return {
    from: () => ({
      leftJoin: () => ({
        leftJoin: () => ({
          where: () => ({
            groupBy: () => result,
          }),
        }),
      }),
    }),
  };
}

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

describe("committee_role schema fallback", () => {
  it("awaits the primary query and returns fallback rows for an old schema", async () => {
    selectMock
      .mockReturnValueOnce(
        importanceQuery(
          Promise.reject(new Error('column "committee_role" does not exist')),
        ),
      )
      .mockReturnValueOnce(
        importanceQuery(
          Promise.resolve([
            {
              id: 7,
              committees: ["문화체육관광위원회"],
              committeeRole: null,
              isManualWatch: false,
              sponsoredBillCount: 1,
            },
          ]),
        ),
      );

    const result = await computeImportance({
      profileId: 1,
      committeeCodes: ["문화체육관광위원회"],
    });

    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(result.get(7)).toMatchObject({
      level: "A",
      committeeRole: null,
      sponsoredBillCount: 1,
    });
  });

  it("rethrows errors unrelated to the missing compatibility column", async () => {
    selectMock.mockReturnValueOnce(
      importanceQuery(Promise.reject(new Error("connection refused"))),
    );

    await expect(
      computeImportance({ profileId: 1, committeeCodes: [] }),
    ).rejects.toThrow("connection refused");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });
});
