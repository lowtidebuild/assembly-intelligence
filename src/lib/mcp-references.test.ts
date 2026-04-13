import { describe, expect, it } from "vitest";
import { normalizeBillReferenceKeyword } from "@/lib/mcp-references";

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
