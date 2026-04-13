import { describe, expect, it } from "vitest";
import {
  classifyUtteranceTone,
  deriveBillPassageSignal,
  deriveStanceLabel,
  summarizeLegislatorIssueSignals,
  type LegislatorStanceSignal,
} from "@/lib/stance-analysis";

describe("classifyUtteranceTone", () => {
  it("detects supportive cues", () => {
    expect(
      classifyUtteranceTone("이 제도는 산업 지원과 촉진을 위해 조속히 도입할 필요가 있습니다."),
    ).toMatchObject({
      tone: "support",
    });
  });

  it("detects concern cues", () => {
    expect(
      classifyUtteranceTone("현재 규제는 과도하고 부작용 우려가 있어 재검토가 필요합니다."),
    ).toMatchObject({
      tone: "concern",
    });
  });
});

describe("deriveStanceLabel", () => {
  it("prefers direct vote results over weak text signals", () => {
    expect(
      deriveStanceLabel({
        score: 1,
        supportiveMentions: 1,
        concernMentions: 0,
        voteResult: "no",
      }),
    ).toBe("concern");
  });
});

describe("deriveBillPassageSignal", () => {
  it("marks a bill as passed when yes votes already exist", () => {
    const signals: LegislatorStanceSignal[] = [
      {
        legislatorId: 1,
        name: "홍길동",
        party: "더불어민주당",
        committeeRole: "위원장",
        isCommitteeMember: true,
        isLeadSponsor: false,
        stance: "support",
        score: 5,
        confidence: 80,
        transcriptHitCount: 1,
        supportiveMentions: 1,
        concernMentions: 0,
        mixedMentions: 0,
        voteResult: "yes",
        reasons: ["본회의 표결 찬성"],
      },
    ];

    const result = deriveBillPassageSignal({
      bill: {
        id: 1,
        billId: "PRC_TEST",
        billNumber: "2219999",
        billName: "테스트 법안",
        proposerName: "홍길동",
        proposerParty: "더불어민주당",
        committee: "문화체육관광위원회",
        stage: "stage_4",
      },
      signals,
    });

    expect(result.likelihood).toBe("passed");
    expect(result.supportingSignals.some((item) => item.includes("표결"))).toBe(true);
  });
});

describe("summarizeLegislatorIssueSignals", () => {
  it("combines transcript and vote history into a concise stance summary", () => {
    const result = summarizeLegislatorIssueSignals({
      transcriptHits: [
        { content: "산업 지원이 필요하고 제도 개선을 촉진해야 합니다." },
        { content: "현재 규제는 과도하여 재검토가 필요합니다." },
      ],
      recentVotes: [{ result: "yes" }, { result: "no" }, { result: "yes" }],
    });

    expect(result.transcriptHitCount).toBe(2);
    expect(result.recentVoteSummary.yes).toBe(2);
    expect(result.supportingSignals.length).toBeGreaterThan(0);
    expect(result.riskSignals.length).toBeGreaterThan(0);
  });
});
