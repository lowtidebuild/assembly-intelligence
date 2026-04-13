import { describe, expect, it } from "vitest";
import {
  mergeBillSearchResults,
  type SearchBillResult,
} from "@/lib/bill-monitoring";

function makeBill(
  overrides: Partial<SearchBillResult>,
): SearchBillResult {
  return {
    id: undefined,
    billId: "PRC_DEFAULT",
    billNumber: null,
    billName: "기본 법안",
    proposerName: "홍길동",
    committee: null,
    relevanceScore: null,
    stage: null,
    proposalDate: null,
    source: "mcp",
    tracked: false,
    ...overrides,
  };
}

describe("mergeBillSearchResults", () => {
  it("keeps local rows first and removes duplicate live rows by billId", () => {
    const local = [
      makeBill({
        id: 1,
        billId: "PRC_1",
        billNumber: "2211111",
        source: "local",
        tracked: true,
      }),
    ];
    const live = [
      makeBill({
        billId: "PRC_1",
        billNumber: "2211111",
        billName: "중복 법안",
      }),
      makeBill({
        billId: "PRC_2",
        billNumber: "2212222",
        billName: "새 법안",
      }),
    ];

    expect(mergeBillSearchResults(local, live)).toEqual([
      local[0],
      live[1],
    ]);
  });

  it("dedupes by billNumber when billId differs", () => {
    const local = [
      makeBill({
        id: 5,
        billId: "PRC_LOCAL",
        billNumber: "2217868",
        source: "local",
        tracked: true,
      }),
    ];
    const live = [
      makeBill({
        billId: "PRC_REMOTE",
        billNumber: "2217868",
      }),
    ];

    expect(mergeBillSearchResults(local, live)).toEqual(local);
  });
});
