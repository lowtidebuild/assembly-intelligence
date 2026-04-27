import { describe, expect, it, vi } from "vitest";
import { enrichBillEvidence } from "@/services/evidence-enrichment";

const baseInput = {
  billId: "PRC_TEST",
  billName: "게임산업진흥에 관한 법률 일부개정법률안",
  committee: "문화체육관광위원회",
  proposerName: "홍길동",
  proposerParty: "무소속",
  proposalDate: "2026-04-27",
};

describe("enrichBillEvidence", () => {
  it("prefers MCP detail body fields", async () => {
    const fetchBodyFragment = vi.fn();

    const result = await enrichBillEvidence({
      ...baseInput,
      mcpBody: {
        proposalReason: "MCP 제안이유",
        mainContent: null,
      },
      existingBody: {
        proposalReason: "기존 DB 제안이유",
        mainContent: "기존 DB 주요내용",
      },
      fetchBodyFragment,
    });

    expect(result.proposalReason).toBe("MCP 제안이유");
    expect(result.mainContent).toBeNull();
    expect(result.evidence.level).toBe("body");
    expect(result.evidence.bodyFetchStatus).toBe("from_mcp_detail");
    expect(fetchBodyFragment).not.toHaveBeenCalled();
  });

  it("reuses existing DB body before trying LIKMS", async () => {
    const fetchBodyFragment = vi.fn();

    const result = await enrichBillEvidence({
      ...baseInput,
      mcpBody: {
        proposalReason: null,
        mainContent: null,
      },
      existingBody: {
        proposalReason: null,
        mainContent: "기존 DB 주요내용",
      },
      fetchBodyFragment,
    });

    expect(result.mainContent).toBe("기존 DB 주요내용");
    expect(result.evidence.level).toBe("body");
    expect(result.evidence.bodyFetchStatus).toBe("from_existing_db");
    expect(fetchBodyFragment).not.toHaveBeenCalled();
  });

  it("fetches LIKMS body when local sources have no body", async () => {
    const fetchBodyFragment = vi.fn().mockResolvedValue({
      proposalReason: "LIKMS 제안이유",
      mainContent: "LIKMS 주요내용",
    });

    const result = await enrichBillEvidence({
      ...baseInput,
      mcpBody: {
        proposalReason: null,
        mainContent: null,
      },
      existingBody: null,
      fetchBodyFragment,
    });

    expect(result.proposalReason).toBe("LIKMS 제안이유");
    expect(result.mainContent).toBe("LIKMS 주요내용");
    expect(result.evidence.level).toBe("body");
    expect(result.evidence.bodyFetchStatus).toBe("fetched");
  });

  it("marks metadata-only evidence when body fetch is empty", async () => {
    const result = await enrichBillEvidence({
      ...baseInput,
      mcpBody: {
        proposalReason: null,
        mainContent: null,
      },
      existingBody: null,
      fetchBodyFragment: vi.fn().mockResolvedValue(null),
    });

    expect(result.proposalReason).toBeNull();
    expect(result.mainContent).toBeNull();
    expect(result.evidence.level).toBe("metadata");
    expect(result.evidence.bodyFetchStatus).toBe("empty");
    expect(result.evidence.missingFields).toContain("proposalReason");
    expect(result.evidence.missingFields).toContain("mainContent");
  });

  it("marks title-only evidence when metadata is also absent", async () => {
    const result = await enrichBillEvidence({
      billId: "PRC_TITLE_ONLY",
      billName: "제목만 있는 법률안",
      committee: null,
      proposerName: null,
      proposerParty: null,
      proposalDate: null,
      mcpBody: {
        proposalReason: null,
        mainContent: null,
      },
      existingBody: null,
      fetchBodyFragment: vi.fn().mockResolvedValue(null),
    });

    expect(result.evidence.level).toBe("title_only");
    expect(result.evidence.bodyFetchStatus).toBe("empty");
  });
});
