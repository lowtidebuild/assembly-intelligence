import { describe, expect, it } from "vitest";
import {
  buildEvidenceMeta,
  withReferenceEvidence,
} from "@/lib/evidence";

describe("withReferenceEvidence", () => {
  it("upgrades body evidence when references are attached", () => {
    const evidence = buildEvidenceMeta({
      billName: "게임산업진흥법 일부개정법률안",
      committee: "문화체육관광위원회",
      proposerName: "홍길동",
      proposalReason: "제안이유",
      mainContent: null,
      bodyFetchStatus: "fetched",
    });

    const result = withReferenceEvidence(evidence, 2);

    expect(result.level).toBe("body_with_references");
    expect(result.availableFields).toContain("references");
    expect(result.sourceNotes).toContain("mcp references (2)");
  });

  it("keeps metadata evidence limited even when references exist", () => {
    const evidence = buildEvidenceMeta({
      billName: "전자상거래법 일부개정법률안",
      committee: "정무위원회",
      proposerName: "홍길동",
      proposalReason: null,
      mainContent: null,
      bodyFetchStatus: "empty",
    });

    const result = withReferenceEvidence(evidence, 1);

    expect(result.level).toBe("metadata");
    expect(result.availableFields).toContain("references");
  });
});
