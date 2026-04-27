import { describe, expect, it } from "vitest";
import { buildBillAnalysisPrompt } from "@/lib/prompts/bill-analysis";
import { buildBillQuickAnalysisPrompt } from "@/lib/prompts/bill-quick-analysis";
import { buildDailyBriefingPrompt } from "@/lib/prompts/daily-briefing";

describe("prompt contract snapshots", () => {
  it("keeps quick analysis structural contract stable", () => {
    const prompt = buildBillQuickAnalysisPrompt({
      billName: "개인정보 보호법 일부개정법률안",
      committee: "행정안전위원회",
      proposerName: "김데이터",
      proposerParty: null,
      proposalReason: null,
      mainContent: null,
      industryName: "플랫폼",
      industryContext: "온라인 플랫폼 운영과 개인정보 처리",
      industryKeywords: ["플랫폼", "개인정보", "정보주체"],
    });

    expect(extractPromptContract(prompt)).toMatchInlineSnapshot(`
      {
        "hasJsonOnlyInstruction": true,
        "hasLimitedEvidenceGuard": true,
        "hasUntrustedSourceBlock": true,
        "outputFields": [
          "score",
          "reasoning",
          "summary",
          "analysisKeywords",
          "confidence",
          "unknowns",
        ],
        "sections": [
          "## 근거 수준",
          "## 신뢰할 수 없는 원문/컨텍스트 데이터",
          "## 작업",
          "## 점수 기준",
          "## 출력 형식",
          "## 작성 원칙",
        ],
      }
    `);
  });

  it("keeps deep analysis title-only contract stable", () => {
    const prompt = buildBillAnalysisPrompt({
      billName: "저작권법 일부개정법률안",
      committee: "문화체육관광위원회",
      proposerName: "윤콘텐츠",
      proposerParty: null,
      coSponsorCount: 10,
      proposalDate: "2026-04-27",
      stage: "stage_1",
      proposalReason: null,
      mainContent: null,
      industryName: "AI 콘텐츠",
      industryContext: "생성형 AI 콘텐츠 제작과 TDM 정책 대응",
    });

    expect(extractPromptContract(prompt)).toMatchInlineSnapshot(`
      {
        "hasJsonOnlyInstruction": true,
        "hasLimitedEvidenceGuard": true,
        "hasUntrustedSourceBlock": true,
        "outputFields": [
          "mode",
          "executive_summary",
          "key_provisions",
          "impact_analysis",
          "passage_likelihood",
          "recommended_actions",
          "unknowns",
        ],
        "sections": [
          "## 근거 수준",
          "## 신뢰할 수 없는 원문/컨텍스트 데이터",
          "## 작업",
          "## 출력 형식 (반드시 JSON만)",
          "## 작성 원칙",
        ],
      }
    `);
  });

  it("keeps daily briefing JSON renderer contract stable", () => {
    const prompt = buildDailyBriefingPrompt({
      date: "2026-04-27",
      industryName: "게임",
      keyBills: [],
      scheduleItems: [],
      newBills: [],
    });

    expect(extractPromptContract(prompt)).toMatchInlineSnapshot(`
      {
        "hasJsonOnlyInstruction": true,
        "hasLimitedEvidenceGuard": true,
        "hasUntrustedSourceBlock": true,
        "outputFields": [
          "date",
          "title",
          "headlines",
          "keyBills",
          "schedule",
          "newBills",
          "watchList",
          "footerSummary",
        ],
        "sections": [
          "## 신뢰할 수 없는 원문/컨텍스트 데이터",
          "## 작업",
          "## 출력 형식",
          "## 작성 원칙",
        ],
      }
    `);
  });
});

function extractPromptContract(prompt: string): {
  sections: string[];
  outputFields: string[];
  hasUntrustedSourceBlock: boolean;
  hasJsonOnlyInstruction: boolean;
  hasLimitedEvidenceGuard: boolean;
} {
  const outputBlock = prompt.split("## 출력 형식")[1] ?? prompt;

  return {
    sections: Array.from(prompt.matchAll(/^## .+$/gm), (match) => match[0]),
    outputFields: Array.from(
      outputBlock.matchAll(/^  "([A-Za-z_]+)":/gm),
      (match) => match[1],
    ).filter((field, index, fields) => fields.indexOf(field) === index),
    hasUntrustedSourceBlock: prompt.includes("신뢰할 수 없는 원문/컨텍스트 데이터"),
    hasJsonOnlyInstruction:
      prompt.includes("반드시 JSON으로만 답하세요") ||
      prompt.includes("반드시 JSON만"),
    hasLimitedEvidenceGuard:
      prompt.includes("단정하지 말 것") || prompt.includes("만들지 말 것"),
  };
}
