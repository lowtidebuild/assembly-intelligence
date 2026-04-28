import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMixinBillNameQueries,
  discoverBillCandidates,
  type McpBillListItem,
} from "@/services/candidate-discovery";

const { callMcpToolOrThrow } = vi.hoisted(() => ({
  callMcpToolOrThrow: vi.fn(),
}));

vi.mock("@/lib/mcp-client", () => ({
  callMcpToolOrThrow,
}));

function makeBill(
  overrides: Partial<McpBillListItem> & Pick<McpBillListItem, "의안ID" | "의안명">,
): McpBillListItem {
  const base: McpBillListItem = {
    의안ID: overrides.의안ID,
    의안번호: "2210000",
    의안명: overrides.의안명,
    제안자: "홍길동의원 등 10인",
    제안자구분: "의원",
    대수: "22",
    소관위원회: "문화체육관광위원회",
    제안일: "2026-04-01",
    처리상태: "소관위접수",
    처리일: null,
    상세링크: "https://example.test/bill",
    대표발의자: "홍길동",
    공동발의자: null,
  };
  return { ...base, ...overrides };
}

describe("buildMixinBillNameQueries", () => {
  it("uses formal law names first and silently skips unknown slugs", () => {
    expect(buildMixinBillNameQueries(["ecommerce-act", "unknown"], 1)).toEqual([
      {
        slug: "ecommerce-act",
        query: "전자상거래 등에서의 소비자보호에 관한 법률",
      },
    ]);
  });
});

describe("discoverBillCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates committee search and applies the keyword gate after dedupe", async () => {
    callMcpToolOrThrow
      .mockResolvedValueOnce({
        items: [
          makeBill({
            의안ID: "PRC_GAME",
            의안명: "게임산업진흥에 관한 법률 일부개정법률안",
          }),
          makeBill({
            의안ID: "PRC_FARM",
            의안명: "농업 지원에 관한 특별법안",
          }),
        ],
      })
      .mockResolvedValueOnce({
        items: [
          makeBill({
            의안ID: "PRC_ITEM",
            의안명: "확률형 아이템 표시 의무 강화 법률안",
          }),
        ],
      });

    const result = await discoverBillCandidates({
      committeeCodes: ["문화체육관광위원회"],
      keywords: ["게임산업", "확률형 아이템"],
      excludeKeywords: [],
      pageSize: 2,
      maxPagesPerCommittee: 3,
    });

    expect(callMcpToolOrThrow).toHaveBeenNthCalledWith(1, "assembly_bill", {
      committee: "문화체육관광위원회",
      age: 22,
      page: 1,
      page_size: 2,
    });
    expect(callMcpToolOrThrow).toHaveBeenNthCalledWith(2, "assembly_bill", {
      committee: "문화체육관광위원회",
      age: 22,
      page: 2,
      page_size: 2,
    });
    expect(result.totalListItems).toBe(3);
    expect(result.droppedByKeyword).toBe(1);
    expect(result.droppedByLimit).toBe(0);
    expect(result.candidates.map((candidate) => candidate.listItem.의안ID)).toEqual([
      "PRC_GAME",
      "PRC_ITEM",
    ]);
    expect(result.candidates[0].discoveryKeywords).toEqual(["게임산업"]);
    expect(result.sourceCounts).toEqual({
      committee: 2,
      mixin_law: 0,
      bill_name: 0,
      manual_watch: 0,
    });
  });

  it("caps relevant candidates when maxCandidates is configured", async () => {
    callMcpToolOrThrow.mockResolvedValueOnce({
      items: [
        makeBill({
          의안ID: "PRC_GAME_A",
          의안명: "게임산업진흥에 관한 법률 일부개정법률안",
        }),
        makeBill({
          의안ID: "PRC_GAME_B",
          의안명: "게임산업 이용자 보호 법률안",
        }),
      ],
    });

    const result = await discoverBillCandidates({
      committeeCodes: ["문화체육관광위원회"],
      keywords: ["게임산업", "게임"],
      pageSize: 10,
      maxCandidates: 1,
    });

    expect(result.candidates.map((candidate) => candidate.listItem.의안ID)).toEqual([
      "PRC_GAME_A",
    ]);
    expect(result.droppedByKeyword).toBe(0);
    expect(result.droppedByLimit).toBe(1);
    expect(result.sourceCounts).toEqual({
      committee: 1,
      mixin_law: 0,
      bill_name: 0,
      manual_watch: 0,
    });
  });

  it("uses a conservative default cap when maxCandidates is omitted", async () => {
    callMcpToolOrThrow.mockResolvedValueOnce({
      items: Array.from({ length: 25 }, (_, index) =>
        makeBill({
          의안ID: `PRC_GAME_${index}`,
          의안명: `게임산업 이용자 보호 법률안 ${index}`,
        }),
      ),
    });

    const result = await discoverBillCandidates({
      committeeCodes: ["문화체육관광위원회"],
      keywords: ["게임산업"],
      pageSize: 100,
    });

    expect(result.candidates).toHaveLength(20);
    expect(result.droppedByLimit).toBe(5);
  });

  it("adds law-mixin title searches and keeps source provenance on duplicates", async () => {
    const ecommerceBill = makeBill({
      의안ID: "PRC_ECOM",
      의안명:
        "전자상거래 등에서의 소비자보호에 관한 법률 일부개정법률안",
      소관위원회: "정무위원회",
    });

    callMcpToolOrThrow
      .mockResolvedValueOnce({ items: [ecommerceBill] })
      .mockResolvedValueOnce({ items: [ecommerceBill] })
      .mockResolvedValueOnce({ items: [] });

    const result = await discoverBillCandidates({
      committeeCodes: ["정무위원회"],
      keywords: ["전자상거래 등에서의 소비자보호에 관한 법률"],
      excludeKeywords: [],
      mixinSlugs: ["ecommerce-act"],
      pageSize: 10,
      maxPagesPerCommittee: 2,
    });

    expect(callMcpToolOrThrow).toHaveBeenNthCalledWith(2, "assembly_bill", {
      bill_name: "전자상거래 등에서의 소비자보호에 관한 법률",
      age: 22,
      page_size: 10,
    });
    expect(result.totalListItems).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].discoverySources.map((source) => source.type)).toEqual([
      "committee",
      "mixin_law",
    ]);
    expect(result.sourceCounts).toEqual({
      committee: 1,
      mixin_law: 1,
      bill_name: 0,
      manual_watch: 0,
    });
  });
});
