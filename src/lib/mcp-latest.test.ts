import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  callMcpTool,
  listMcpTools,
  getMcpRuntimeConfig,
} = vi.hoisted(() => ({
  callMcpTool: vi.fn(),
  listMcpTools: vi.fn(),
  getMcpRuntimeConfig: vi.fn(),
}));

vi.mock("@/lib/mcp-client", () => ({
  callMcpTool,
  listMcpTools,
  getMcpRuntimeConfig,
}));

import { getMcpLatestSnapshot } from "@/lib/mcp-latest";

describe("getMcpLatestSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMcpRuntimeConfig.mockReturnValue({
      baseUrl: "https://assembly-api-mcp.fly.dev/mcp",
      defaultProfile: "full",
    });
  });

  it("reports full-only tools and optional source readiness", async () => {
    listMcpTools
      .mockResolvedValueOnce([
        { name: "assembly_member" },
        { name: "assembly_bill" },
        { name: "assembly_session" },
        { name: "assembly_org" },
        { name: "discover_apis" },
        { name: "query_assembly" },
      ])
      .mockResolvedValueOnce([
        { name: "assembly_member" },
        { name: "assembly_bill" },
        { name: "assembly_session" },
        { name: "assembly_org" },
        { name: "discover_apis" },
        { name: "query_assembly" },
        { name: "bill_detail" },
        { name: "committee_detail" },
        { name: "petition_detail" },
        { name: "research_data" },
        { name: "get_nabo" },
      ]);

    callMcpTool
      .mockResolvedValueOnce({
        library: { total: 1, items: [{ TITLE: "2026 예산 분석" }] },
        research: { total: 0, items: [] },
        budget: { total: 0, items: [] },
      })
      .mockResolvedValueOnce({
        error: "LAWMKING_OC가 설정되지 않았습니다.",
        code: "UNKNOWN",
      })
      .mockResolvedValueOnce({
        error: "NABO_API_KEY가 설정되지 않았습니다.",
        code: "UNKNOWN",
      });

    const snapshot = await getMcpLatestSnapshot("게임");

    expect(snapshot.tools.fullOnly).toEqual([
      "bill_detail",
      "committee_detail",
      "petition_detail",
      "research_data",
      "get_nabo",
    ]);
    expect(snapshot.features.research.status).toBe("available");
    expect(snapshot.features.research.total).toBe(1);
    expect(snapshot.features.lawmaking.status).toBe("unconfigured");
    expect(snapshot.features.nabo.status).toBe("unconfigured");
  });
});
