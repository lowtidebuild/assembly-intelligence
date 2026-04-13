import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bill,
  committeeTranscript,
  committeeTranscriptUtterance,
  legislator,
  vote,
} from "@/db/schema";

export type StanceLabel = "support" | "concern" | "mixed" | "unclear";
export type PassageLikelihood = "passed" | "high" | "medium" | "low";

export interface LegislatorStanceSignal {
  legislatorId: number;
  name: string;
  party: string;
  committeeRole: string | null;
  isCommitteeMember: boolean;
  isLeadSponsor: boolean;
  stance: StanceLabel;
  score: number;
  confidence: number;
  transcriptHitCount: number;
  supportiveMentions: number;
  concernMentions: number;
  mixedMentions: number;
  voteResult: "yes" | "no" | "abstain" | "absent" | "unknown" | null;
  reasons: string[];
}

export interface BillTranscriptEvidenceItem {
  utteranceId: number;
  minutesId: string;
  meetingName: string;
  meetingDate: string | null;
  committee: string | null;
  sessionLabel: string | null;
  place: string | null;
  speakerName: string;
  speakerRole: string | null;
  content: string;
  matchedKeywords: string[];
  snippet: string | null;
  tone: StanceLabel;
}

export interface BillPassageSignal {
  likelihood: PassageLikelihood;
  confidence: number;
  rationale: string;
  supportingSignals: string[];
  riskSignals: string[];
  majorStanceCounts: {
    support: number;
    concern: number;
    mixed: number;
    unclear: number;
  };
}

export interface LegislatorIssueSummary {
  stance: StanceLabel;
  confidence: number;
  transcriptHitCount: number;
  supportiveMentions: number;
  concernMentions: number;
  mixedMentions: number;
  recentVoteSummary: {
    yes: number;
    no: number;
    abstain: number;
    absent: number;
    unknown: number;
  };
  supportingSignals: string[];
  riskSignals: string[];
}

const SUPPORT_CUES = [
  "찬성",
  "환영",
  "촉진",
  "지원",
  "강화",
  "조속",
  "동의",
  "타당",
  "바람직",
  "도입",
  "개선",
];

const CONCERN_CUES = [
  "우려",
  "반대",
  "신중",
  "문제",
  "과도",
  "부작용",
  "재검토",
  "부담",
  "논란",
  "불명확",
  "어려움",
  "위험",
];

type BillContext = {
  id: number;
  billId: string;
  billNumber: string | null;
  billName: string;
  proposerName: string;
  proposerParty: string | null;
  committee: string | null;
  stage: string;
};

type VoteSignalRow = {
  legislatorId: number;
  name: string;
  party: string;
  result: "yes" | "no" | "abstain" | "absent" | "unknown";
  voteDate: Date;
};

export function classifyUtteranceTone(content: string): {
  supportive: number;
  concern: number;
  tone: StanceLabel;
} {
  const haystack = content.toLowerCase();
  const supportive = SUPPORT_CUES.filter((cue) =>
    haystack.includes(cue.toLowerCase()),
  ).length;
  const concern = CONCERN_CUES.filter((cue) =>
    haystack.includes(cue.toLowerCase()),
  ).length;

  if (supportive === 0 && concern === 0) {
    return { supportive, concern, tone: "unclear" };
  }
  if (supportive > 0 && concern > 0) {
    return { supportive, concern, tone: "mixed" };
  }
  if (supportive > concern) {
    return { supportive, concern, tone: "support" };
  }
  if (concern > supportive) {
    return { supportive, concern, tone: "concern" };
  }
  return { supportive, concern, tone: "mixed" };
}

export function deriveStanceLabel(input: {
  score: number;
  supportiveMentions: number;
  concernMentions: number;
  voteResult: LegislatorStanceSignal["voteResult"];
}): StanceLabel {
  if (input.voteResult === "yes" || input.score >= 4) return "support";
  if (input.voteResult === "no" || input.score <= -4) return "concern";
  if (input.supportiveMentions > 0 && input.concernMentions > 0) return "mixed";
  if (input.score > 0 || input.supportiveMentions > 0) return "support";
  if (input.score < 0 || input.concernMentions > 0) return "concern";
  return "unclear";
}

export async function computeLegislatorStanceSignals(
  billId: number,
): Promise<{
  bill: BillContext | null;
  transcriptEvidence: BillTranscriptEvidenceItem[];
  signals: LegislatorStanceSignal[];
}> {
  const [targetBill] = await db
    .select({
      id: bill.id,
      billId: bill.billId,
      billNumber: bill.billNumber,
      billName: bill.billName,
      proposerName: bill.proposerName,
      proposerParty: bill.proposerParty,
      committee: bill.committee,
      stage: bill.stage,
    })
    .from(bill)
    .where(eq(bill.id, billId))
    .limit(1);

  if (!targetBill) {
    return { bill: null, transcriptEvidence: [], signals: [] };
  }

  const [allMembers, voteRows, transcriptEvidence] = await Promise.all([
    db
      .select({
        id: legislator.id,
        name: legislator.name,
        party: legislator.party,
        committees: legislator.committees,
        committeeRole: legislator.committeeRole,
      })
      .from(legislator)
      .where(eq(legislator.isActive, true)),
    db
      .select({
        legislatorId: legislator.id,
        name: legislator.name,
        party: legislator.party,
        result: vote.result,
        voteDate: vote.voteDate,
      })
      .from(vote)
      .innerJoin(legislator, eq(vote.legislatorId, legislator.id))
      .where(eq(vote.billId, billId))
      .orderBy(desc(vote.voteDate), legislator.name),
    loadBillTranscriptEvidence(targetBill),
  ]);

  const memberByName = new Map<string, (typeof allMembers)[number]>();
  const duplicateNames = new Set<string>();
  for (const row of allMembers) {
    if (memberByName.has(row.name)) {
      duplicateNames.add(row.name);
      memberByName.delete(row.name);
      continue;
    }
    memberByName.set(row.name, row);
  }
  for (const duplicateName of duplicateNames) {
    memberByName.delete(duplicateName);
  }

  const voteById = new Map<number, VoteSignalRow>();
  for (const row of voteRows) {
    voteById.set(row.legislatorId, row);
  }

  const transcriptBySpeaker = new Map<string, BillTranscriptEvidenceItem[]>();
  for (const item of transcriptEvidence) {
    const current = transcriptBySpeaker.get(item.speakerName) ?? [];
    current.push(item);
    transcriptBySpeaker.set(item.speakerName, current);
  }

  const committeeMembers = targetBill.committee
    ? allMembers.filter((row) => row.committees.includes(targetBill.committee!))
    : [];

  const candidateIds = new Set<number>(
    committeeMembers.map((row) => row.id),
  );
  for (const voteRow of voteRows) {
    candidateIds.add(voteRow.legislatorId);
  }
  const proposer = memberByName.get(targetBill.proposerName);
  if (proposer) {
    candidateIds.add(proposer.id);
  }
  for (const speakerName of transcriptBySpeaker.keys()) {
    const matched = memberByName.get(speakerName);
    if (matched) {
      candidateIds.add(matched.id);
    }
  }

  const signals = allMembers
    .filter((row) => candidateIds.has(row.id))
    .map((row) => {
      const transcriptItems = transcriptBySpeaker.get(row.name) ?? [];
      let supportiveMentions = 0;
      let concernMentions = 0;
      let mixedMentions = 0;
      let score = 0;
      const reasons: string[] = [];

      if (row.name === targetBill.proposerName) {
        score += 5;
        reasons.push("대표발의자");
      }

      const voteSignal = voteById.get(row.id);
      if (voteSignal) {
        if (voteSignal.result === "yes") {
          score += 4;
          reasons.push("본회의 표결 찬성");
        } else if (voteSignal.result === "no") {
          score -= 4;
          reasons.push("본회의 표결 반대");
        } else if (voteSignal.result === "abstain") {
          score -= 2;
          reasons.push("본회의 표결 기권");
        } else if (voteSignal.result === "absent") {
          score -= 1;
          reasons.push("본회의 표결 불참");
        }
      }

      for (const item of transcriptItems) {
        const tone = classifyUtteranceTone(item.content);
        if (tone.tone === "support") {
          supportiveMentions += 1;
          score += 1;
        } else if (tone.tone === "concern") {
          concernMentions += 1;
          score -= 1;
        } else if (tone.tone === "mixed") {
          mixedMentions += 1;
        }
      }

      if (supportiveMentions > 0) {
        reasons.push(`관련 회의록에서 긍정 발언 ${supportiveMentions}건`);
      }
      if (concernMentions > 0) {
        reasons.push(`관련 회의록에서 우려 발언 ${concernMentions}건`);
      }
      if (mixedMentions > 0) {
        reasons.push(`관련 회의록에서 혼합 신호 ${mixedMentions}건`);
      }

      const isCommitteeMember =
        targetBill.committee !== null && row.committees.includes(targetBill.committee);
      if (isCommitteeMember && row.committeeRole === "위원장") {
        reasons.push("소관위 위원장");
      } else if (isCommitteeMember && row.committeeRole === "간사") {
        reasons.push("소관위 간사");
      }

      const confidence = Math.min(
        95,
        20 +
          (voteSignal ? 35 : 0) +
          Math.min(3, transcriptItems.length) * 12 +
          (row.name === targetBill.proposerName ? 18 : 0) +
          (row.committeeRole === "위원장" ? 10 : row.committeeRole === "간사" ? 6 : 0),
      );

      const stance = deriveStanceLabel({
        score,
        supportiveMentions,
        concernMentions,
        voteResult: voteSignal?.result ?? null,
      });

      return {
        legislatorId: row.id,
        name: row.name,
        party: row.party,
        committeeRole: row.committeeRole,
        isCommitteeMember,
        isLeadSponsor: row.name === targetBill.proposerName,
        stance,
        score,
        confidence,
        transcriptHitCount: transcriptItems.length,
        supportiveMentions,
        concernMentions,
        mixedMentions,
        voteResult: voteSignal?.result ?? null,
        reasons,
      } satisfies LegislatorStanceSignal;
    })
    .filter(
      (row) =>
        row.isLeadSponsor ||
        row.voteResult !== null ||
        row.transcriptHitCount > 0 ||
        (row.isCommitteeMember && row.committeeRole !== null),
    )
    .sort((left, right) => {
      const confidenceDelta = right.confidence - left.confidence;
      if (confidenceDelta !== 0) return confidenceDelta;
      const scoreDelta = Math.abs(right.score) - Math.abs(left.score);
      if (scoreDelta !== 0) return scoreDelta;
      return right.transcriptHitCount - left.transcriptHitCount;
    });

  return {
    bill: targetBill,
    transcriptEvidence,
    signals,
  };
}

export function deriveBillPassageSignal(input: {
  bill: BillContext;
  signals: LegislatorStanceSignal[];
}): BillPassageSignal {
  const targetBill = input.bill;
  const signals = input.signals;
  const supportSignals = signals.filter((entry) => entry.stance === "support");
  const concernSignals = signals.filter((entry) => entry.stance === "concern");
  const mixedSignals = signals.filter((entry) => entry.stance === "mixed");
  const unclearSignals = signals.filter((entry) => entry.stance === "unclear");

  const supportWeight = sumScoreMagnitude(supportSignals);
  const concernWeight = sumScoreMagnitude(concernSignals);
  const leaderSupport = supportSignals.filter(isLeaderSignal);
  const leaderConcern = concernSignals.filter(isLeaderSignal);
  const voteSignals = signals.filter((entry) => entry.voteResult !== null);

  let likelihood: PassageLikelihood = "medium";
  const supportingSignals: string[] = [];
  const riskSignals: string[] = [];

  if (targetBill.stage === "stage_6" || targetBill.stage === "stage_5") {
    likelihood = "passed";
    supportingSignals.push("정부 이송 또는 공포 단계까지 진행됨");
  } else if (voteSignals.some((entry) => entry.voteResult === "yes")) {
    likelihood = "passed";
    supportingSignals.push(
      `본회의 표결에서 찬성 ${voteSignals.filter((entry) => entry.voteResult === "yes").length}명 확인`,
    );
  } else if (voteSignals.some((entry) => entry.voteResult === "no")) {
    likelihood = "low";
    riskSignals.push(
      `본회의 표결에서 반대 ${voteSignals.filter((entry) => entry.voteResult === "no").length}명 확인`,
    );
  } else if (supportWeight >= concernWeight * 1.5 && leaderSupport.length >= leaderConcern.length) {
    likelihood = "high";
  } else if (concernWeight > supportWeight * 1.2 || leaderConcern.length > leaderSupport.length) {
    likelihood = "low";
  }

  if (supportSignals.length > 0) {
    supportingSignals.push(`주요 의원 ${supportSignals.length}명이 찬성 경향`);
  }
  if (leaderSupport.length > 0) {
    supportingSignals.push(`소관위 지도부 ${leaderSupport.length}명이 긍정 신호`);
  }
  if (concernSignals.length > 0) {
    riskSignals.push(`주요 의원 ${concernSignals.length}명이 우려 경향`);
  }
  if (leaderConcern.length > 0) {
    riskSignals.push(`소관위 지도부 ${leaderConcern.length}명이 부정 신호`);
  }
  if (mixedSignals.length > 0) {
    riskSignals.push(`회의록/표결 해석이 엇갈리는 의원 ${mixedSignals.length}명`);
  }
  if (targetBill.stage === "stage_2" || targetBill.stage === "stage_3") {
    supportingSignals.push(`법안이 이미 ${targetBill.stage === "stage_2" ? "상임위" : "법사위"} 단계까지 진입`);
  }

  const confidence = Math.min(
    95,
    35 +
      Math.min(5, signals.length) * 7 +
      leaderSupport.length * 6 +
      leaderConcern.length * 6 +
      (voteSignals.length > 0 ? 20 : 0),
  );

  const rationale =
    likelihood === "passed"
      ? "이미 표결 또는 후속 입법 절차가 확인되어 사실상 통과 완료 상태로 봅니다."
      : likelihood === "high"
        ? "소관위 지도부와 주요 의원 신호가 대체로 우호적이라 통과 가능성이 높은 편으로 판단됩니다."
        : likelihood === "low"
          ? "회의록/표결 또는 지도부 신호에서 부정 요인이 더 강하게 나타나 통과 가능성이 낮아 보입니다."
          : "우호와 우려 신호가 혼재해 있어 현재로서는 중간 수준의 통과 가능성으로 보는 것이 안전합니다.";

  return {
    likelihood,
    confidence,
    rationale,
    supportingSignals,
    riskSignals,
    majorStanceCounts: {
      support: supportSignals.length,
      concern: concernSignals.length,
      mixed: mixedSignals.length,
      unclear: unclearSignals.length,
    },
  };
}

export async function computeBillPassageSignal(
  billId: number,
): Promise<BillPassageSignal | null> {
  const { bill: targetBill, signals } = await computeLegislatorStanceSignals(billId);
  if (!targetBill) return null;
  return deriveBillPassageSignal({ bill: targetBill, signals });
}

export function summarizeLegislatorIssueSignals(input: {
  transcriptHits: Array<{ content?: string | null }>;
  recentVotes: Array<{ result: "yes" | "no" | "abstain" | "absent" | "unknown" }>;
}): LegislatorIssueSummary {
  let supportiveMentions = 0;
  let concernMentions = 0;
  let mixedMentions = 0;

  for (const entry of input.transcriptHits) {
    const tone = classifyUtteranceTone(entry.content ?? "");
    if (tone.tone === "support") supportiveMentions += 1;
    if (tone.tone === "concern") concernMentions += 1;
    if (tone.tone === "mixed") mixedMentions += 1;
  }

  const recentVoteSummary = {
    yes: input.recentVotes.filter((entry) => entry.result === "yes").length,
    no: input.recentVotes.filter((entry) => entry.result === "no").length,
    abstain: input.recentVotes.filter((entry) => entry.result === "abstain").length,
    absent: input.recentVotes.filter((entry) => entry.result === "absent").length,
    unknown: input.recentVotes.filter((entry) => entry.result === "unknown").length,
  };

  const score =
    supportiveMentions -
    concernMentions +
    Math.max(0, recentVoteSummary.yes - recentVoteSummary.no) -
    Math.max(0, recentVoteSummary.no - recentVoteSummary.yes);

  const stance = deriveStanceLabel({
    score,
    supportiveMentions,
    concernMentions,
    voteResult: null,
  });

  const supportingSignals: string[] = [];
  const riskSignals: string[] = [];
  if (supportiveMentions > 0) {
    supportingSignals.push(`회의록에서 긍정/지원 발언 ${supportiveMentions}건`);
  }
  if (recentVoteSummary.yes > 0) {
    supportingSignals.push(`최근 표결 찬성 ${recentVoteSummary.yes}건`);
  }
  if (concernMentions > 0) {
    riskSignals.push(`회의록에서 우려/재검토 발언 ${concernMentions}건`);
  }
  if (recentVoteSummary.no > 0) {
    riskSignals.push(`최근 표결 반대 ${recentVoteSummary.no}건`);
  }
  if (mixedMentions > 0) {
    riskSignals.push(`혼합 신호 발언 ${mixedMentions}건`);
  }

  return {
    stance,
    confidence: Math.min(
      90,
      25 +
        Math.min(5, input.transcriptHits.length) * 8 +
        Math.min(5, input.recentVotes.length) * 5,
    ),
    transcriptHitCount: input.transcriptHits.length,
    supportiveMentions,
    concernMentions,
    mixedMentions,
    recentVoteSummary,
    supportingSignals,
    riskSignals,
  };
}

async function loadBillTranscriptEvidence(
  targetBill: BillContext,
): Promise<BillTranscriptEvidenceItem[]> {
  if (!targetBill.committee) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const transcriptRows = await db
    .select()
    .from(committeeTranscript)
    .where(
      and(
        eq(committeeTranscript.committee, targetBill.committee),
        gte(committeeTranscript.meetingDate, cutoffDate),
      ),
    )
    .orderBy(desc(committeeTranscript.meetingDate), desc(committeeTranscript.fetchedAt))
    .limit(20);

  const relatedTranscripts = transcriptRows.filter((row) =>
    row.agendaItems.some(
      (item) =>
        item.billId === targetBill.billId ||
        (!!targetBill.billNumber && item.billNumber === targetBill.billNumber) ||
        item.title.includes(targetBill.billName),
    ),
  );

  if (relatedTranscripts.length === 0) return [];

  const transcriptIds = relatedTranscripts.map((row) => row.id);
  const transcriptById = new Map(relatedTranscripts.map((row) => [row.id, row]));

  const utterances = await db
    .select({
      id: committeeTranscriptUtterance.id,
      transcriptId: committeeTranscriptUtterance.transcriptId,
      speakerName: committeeTranscriptUtterance.speakerName,
      speakerRole: committeeTranscriptUtterance.speakerRole,
      content: committeeTranscriptUtterance.content,
      matchedKeywords: committeeTranscriptUtterance.matchedKeywords,
      snippet: committeeTranscriptUtterance.snippet,
    })
    .from(committeeTranscriptUtterance)
    .where(
      and(
        inArray(committeeTranscriptUtterance.transcriptId, transcriptIds),
        eq(committeeTranscriptUtterance.hasKeywordMatch, true),
      ),
    )
    .orderBy(desc(committeeTranscriptUtterance.transcriptId));

  return utterances
    .map((row) => {
      const transcript = transcriptById.get(row.transcriptId);
      if (!transcript) return null;
      return {
        utteranceId: row.id,
        minutesId: transcript.minutesId,
        meetingName: transcript.meetingName,
        meetingDate: transcript.meetingDate,
        committee: transcript.committee,
        sessionLabel: transcript.sessionLabel,
        place: transcript.place,
        speakerName: row.speakerName,
        speakerRole: row.speakerRole,
        content: row.content,
        matchedKeywords: row.matchedKeywords,
        snippet: row.snippet,
        tone: classifyUtteranceTone(row.content).tone,
      } satisfies BillTranscriptEvidenceItem;
    })
    .filter((row): row is BillTranscriptEvidenceItem => row !== null);
}

function sumScoreMagnitude(signals: LegislatorStanceSignal[]) {
  return signals.reduce((sum, entry) => sum + Math.abs(entry.score), 0);
}

function isLeaderSignal(entry: LegislatorStanceSignal) {
  return entry.committeeRole === "위원장" || entry.committeeRole === "간사";
}
