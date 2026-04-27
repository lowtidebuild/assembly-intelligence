import { describe, expect, it } from "vitest";
import goldenFixtures from "../../tests/fixtures/golden-bills.json";
import {
  evaluateGoldenFixture,
  validateGoldenQuickAnalysisOutput,
  type GoldenBillFixture,
} from "@/services/golden-fixtures";

const fixtures = goldenFixtures as unknown as GoldenBillFixture[];

describe("golden bill fixtures", () => {
  it("keeps fixture 0 as the game + ecommerce-act discovery regression", () => {
    const fixture = fixtures[0];

    expect(fixture.id).toBe("golden-000-game-ecommerce-act-recall");
    expect(fixture.profile.industryName).toBe("게임");
    expect(fixture.profile.selectedMixins).toContain("ecommerce-act");
    expect(fixture.mcp.bill.소관위원회).toBe("정무위원회");
    expect(fixture.mcp.bill.의안명).toContain(
      "전자상거래 등에서의 소비자보호에 관한 법률",
    );
  });

  it.each(fixtures)("passes offline golden checks for $id", async (fixture) => {
    const evaluation = await evaluateGoldenFixture(fixture);

    expect(evaluation.failures).toEqual([]);
    expect(evaluation.candidateBillIds).toEqual(
      fixture.expected.candidateBillIds,
    );
    expect(evaluation.discoverySourceTypes).toEqual(
      fixture.expected.discoverySourceTypes,
    );
  });

  it("validates optional live quick-analysis outputs against fixture policy", () => {
    const fixture = fixtures[0];

    expect(
      validateGoldenQuickAnalysisOutput(
        fixture,
        {
          score: 4,
          reasoning: "전자상거래 소비자보호 이슈가 게임 결제/환불 운영에 직접 연결된다.",
          summary: "본문은 미확보 상태라 구체 조항은 확인 불가하다.",
          analysisKeywords: ["전자상거래", "소비자보호"],
          unknowns: ["제안이유 및 주요내용 미확보"],
        },
        { titleOnly: true },
      ),
    ).toEqual([]);

    expect(
      validateGoldenQuickAnalysisOutput(
        fixture,
        {
          score: 5,
          reasoning: "24시간 내 신고 의무와 과태료가 생긴다.",
          summary: "전자상거래 소비자보호 법안이다.",
          unknowns: [],
        },
        { titleOnly: true },
      ),
    ).toEqual([
      'title-only output contains forbidden claim "과태료"',
      'title-only output contains forbidden claim "24시간 내"',
      'title-only output contains forbidden claim "신고 의무"',
      "title-only output missing explicit unknowns",
    ]);
  });
});
