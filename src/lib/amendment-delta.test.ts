import { describe, expect, it } from "vitest";
import {
  buildRuleBasedAmendmentDelta,
  classifyChangeTypes,
  extractAffectedArticles,
} from "@/lib/amendment-delta";

describe("amendment delta extraction", () => {
  it("extracts newly created esports safety duties", () => {
    const delta = buildRuleBasedAmendmentDelta({
      billName: "이스포츠(전자스포츠) 진흥에 관한 법률 일부개정법률안",
      proposalReason: `주요내용은 다음과 같음.
가. 일정 규모 이상의 이스포츠 경기를 개최하려는 자는 안전관리계획을 수립하도록 함(안 제11조의2 신설).
나. 문화체육관광부장관은 안전교육 및 현장점검을 실시할 수 있도록 함.`,
      mainContent: null,
    });

    expect(delta).not.toBeNull();
    expect(delta?.source).toBe("proposal_reason");
    expect(delta?.changeTypes).toEqual(expect.arrayContaining(["신설", "의무화"]));
    expect(delta?.affectedArticles).toContain("안 제11조의2");
    expect(delta?.keyChanges.join(" ")).toContain("안전관리계획");
    expect(delta?.operationalImpacts.join(" ")).toContain("운영 프로세스");
  });

  it("captures accessibility support as a concrete game industry change", () => {
    const delta = buildRuleBasedAmendmentDelta({
      billName: "게임산업진흥에 관한 법률 일부개정법률안",
      proposalReason:
        "장애인의 게임물 접근성을 높이기 위하여 국가와 지방자치단체가 게임물 접근성 개선을 지원할 수 있도록 함(안 제12조의3 신설).",
      mainContent: null,
    });

    expect(delta?.changeTypes).toEqual(expect.arrayContaining(["신설", "지원"]));
    expect(delta?.affectedArticles).toContain("안 제12조의3");
    expect(delta?.affectedParties).toEqual(expect.arrayContaining(["장애인"]));
    expect(delta?.financialImpacts.join(" ")).toContain("지원");
  });

  it("handles dense article ranges in cybersecurity amendments", () => {
    const text =
      "침해사고정보 공유체계를 마련하기 위하여 정보통신서비스 제공자가 침해사고 관련 정보를 공유하도록 하고, 필요한 절차를 정함(안 제48조의2제10항부터 제13항까지 신설).";

    expect(extractAffectedArticles(text)).toContain(
      "안 제48조의2제10항부터 제13항까지",
    );
    expect(classifyChangeTypes(text)).toEqual(
      expect.arrayContaining(["신설", "의무화", "절차"]),
    );
  });
});
