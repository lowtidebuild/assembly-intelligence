import { describe, expect, it } from "vitest";
import {
  flattenBillReferenceSections,
  normalizeBillReferenceKeyword,
} from "@/lib/mcp-references";

describe("normalizeBillReferenceKeyword", () => {
  it("drops common legislative suffixes", () => {
    expect(
      normalizeBillReferenceKeyword("게임산업진흥에 관한 법률 일부개정법률안"),
    ).toBe("게임산업진흥에 관한 법률");
    expect(
      normalizeBillReferenceKeyword("전자상거래 등에서의 소비자보호에 관한 법률안"),
    ).toBe("전자상거래 등에서의 소비자보호에 관한 법률");
  });

  it("keeps already-normalized names intact", () => {
    expect(normalizeBillReferenceKeyword("정보통신망법")).toBe("정보통신망법");
  });
});

describe("flattenBillReferenceSections", () => {
  it("orders lawmaking, research, then NABO and caps the prompt payload", () => {
    const flattened = flattenBillReferenceSections(
      {
        keyword: "전자상거래법",
        lawmaking: [
          { source: "lawmaking", title: "입법예고 A", url: "a" },
          { source: "lawmaking", title: "입법예고 A", url: "a" },
        ],
        research: [
          { source: "research", title: "연구자료 B", url: "b" },
          { source: "research", title: "연구자료 C", url: "c" },
        ],
        nabo: [
          { source: "nabo", title: "NABO D", url: "d" },
          { source: "nabo", title: "NABO E", url: "e" },
        ],
      },
      3,
    );

    expect(flattened).toEqual([
      { source: "lawmaking", title: "입법예고 A", url: "a" },
      { source: "research", title: "연구자료 B", url: "b" },
      { source: "research", title: "연구자료 C", url: "c" },
    ]);
  });
});
