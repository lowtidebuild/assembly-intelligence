import { describe, expect, it } from "vitest";
import { buildBillAnalysisPrompt } from "@/lib/prompts/bill-analysis";
import { buildBillQuickAnalysisPrompt } from "@/lib/prompts/bill-quick-analysis";
import { buildCompanyImpactPrompt } from "@/lib/prompts/company-impact";
import { buildDailyBriefingPrompt } from "@/lib/prompts/daily-briefing";

describe("quality guard prompts", () => {
  it("uses the actual briefing date instead of the old template date", () => {
    const prompt = buildDailyBriefingPrompt({
      date: "2026-04-27",
      industryName: "게임",
      keyBills: [],
      scheduleItems: [],
      newBills: [],
    });

    expect(prompt).toContain("2026년 4월 27일 | 게임 인텔리전스");
    expect(prompt).not.toContain("2026년 4월 10일");
  });

  it("marks company impact drafts as metadata-only when bill body is missing", () => {
    const prompt = buildCompanyImpactPrompt({
      billName: "전자상거래 등에서의 소비자보호에 관한 법률 일부개정법률안",
      committee: "정무위원회",
      proposerName: "홍길동",
      proposerParty: "무소속",
      proposalReason: null,
      mainContent: null,
      industryName: "게임",
      industryContext: "게임 퍼블리싱 및 플랫폼 운영",
    });

    expect(prompt).toContain("evidenceLevel: metadata");
    expect(prompt).toContain("bodyFetchStatus: not_attempted");
    expect(prompt).toContain("구체 조항");
    expect(prompt).toContain("단정하지 말 것");
    expect(prompt).toContain('"missingFields": [');
  });

  it("keeps quick analysis metadata-only when bill body is missing", () => {
    const prompt = buildBillQuickAnalysisPrompt({
      billName: "전자상거래 등에서의 소비자보호에 관한 법률 일부개정법률안",
      committee: "정무위원회",
      proposerName: "홍길동",
      proposerParty: "무소속",
      proposalReason: null,
      mainContent: null,
      industryName: "게임",
      industryContext: "게임 퍼블리싱 및 플랫폼 운영",
      industryKeywords: ["게임", "전자상거래"],
    });

    expect(prompt).toContain("evidenceLevel: metadata");
    expect(prompt).toContain("bodyFetchStatus: not_attempted");
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"analysisKeywords"');
    expect(prompt).toContain('"unknowns"');
    expect(prompt).toContain("단정하지 말 것");
  });

  it("forces limited deep analysis when bill body is missing", () => {
    const prompt = buildBillAnalysisPrompt({
      billName: "전자상거래 등에서의 소비자보호에 관한 법률 일부개정법률안",
      committee: "정무위원회",
      proposerName: "홍길동",
      proposerParty: "무소속",
      coSponsorCount: 10,
      proposalDate: "2026-04-27",
      stage: "stage_1",
      proposalReason: null,
      mainContent: null,
      industryName: "게임",
      industryContext: "게임 퍼블리싱 및 플랫폼 운영",
    });

    expect(prompt).toContain("mode: limited_analysis");
    expect(prompt).toContain("bodyFetchStatus: not_attempted");
    expect(prompt).toContain('"mode": "limited_analysis"');
    expect(prompt).toContain('"unknowns"');
    expect(prompt).toContain("구체 조항");
    expect(prompt).toContain("만들지 말 것");
  });

  it("uses full deep analysis mode when bill body is available", () => {
    const prompt = buildBillAnalysisPrompt({
      billName: "게임산업진흥에 관한 법률 일부개정법률안",
      committee: "문화체육관광위원회",
      proposerName: "홍길동",
      proposerParty: "무소속",
      coSponsorCount: 10,
      proposalDate: "2026-04-27",
      stage: "stage_1",
      proposalReason: "게임 이용자 보호를 강화하려는 것임.",
      mainContent: "확률형 아이템 표시 의무를 정비함.",
      industryName: "게임",
      industryContext: "게임 퍼블리싱 및 플랫폼 운영",
    });

    expect(prompt).toContain("mode: full_analysis");
    expect(prompt).toContain('"mode": "full_analysis"');
  });

  it("keeps references as secondary context for deep analysis", () => {
    const prompt = buildBillAnalysisPrompt({
      billName: "게임산업진흥에 관한 법률 일부개정법률안",
      committee: "문화체육관광위원회",
      proposerName: "홍길동",
      proposerParty: "무소속",
      coSponsorCount: 10,
      proposalDate: "2026-04-27",
      stage: "stage_1",
      proposalReason: "게임 이용자 보호를 강화하려는 것임.",
      mainContent: "확률형 아이템 표시 의무를 정비함.",
      industryName: "게임",
      industryContext: "게임 퍼블리싱 및 플랫폼 운영",
      references: [
        {
          source: "research",
          title: "게임 이용자 보호 정책 연구",
          subtitle: "국회입법조사처",
          url: "https://example.test/reference",
        },
      ],
    });

    expect(prompt).toContain("evidenceLevel: body_with_references");
    expect(prompt).toContain("references: 1건");
    expect(prompt).toContain("참고자료는 배경/정책 맥락 보조용");
    expect(prompt).toContain("게임 이용자 보호 정책 연구");
  });
});
