import type {
  Bill,
  CommitteeTranscript,
  CommitteeTranscriptUtterance,
  NewsArticle,
} from "@/db/schema";
import type { CompatLegislatorSummaryRow } from "@/lib/db-compat";

export interface DemoWatchSeedEntry {
  memberId: string;
  reason: string;
  addedAt: string;
}

export interface DemoTranscriptHit {
  utteranceId: number;
  transcriptId: number;
  minutesId: string;
  committee: string | null;
  meetingName: string;
  meetingDate: string | null;
  sessionLabel: string | null;
  place: string | null;
  sourceUrl: string | null;
  speakerName: string;
  speakerRole: string | null;
  speakerArea: string | null;
  content: string;
  matchedKeywords: string[];
  snippet: string | null;
}

export const DEMO_WATCH_SEEDS: DemoWatchSeedEntry[] = [
  {
    memberId: "8TU8443O",
    reason: "소관위 (문화체육관광위원회) · 대표발의 1건",
    addedAt: "2026-04-11T04:49:00.000Z",
  },
  {
    memberId: "QDU1100U",
    reason: "소관위 (문화체육관광위원회) · 대표발의 2건",
    addedAt: "2026-04-11T04:48:00.000Z",
  },
  {
    memberId: "OFE45081",
    reason: "법제사법위원회 간사",
    addedAt: "2026-04-11T04:47:00.000Z",
  },
  {
    memberId: "TKJ4800F",
    reason: "법제사법위원회 위원장",
    addedAt: "2026-04-11T04:46:00.000Z",
  },
  {
    memberId: "X1K3667J",
    reason: "문화체육관광위원회 위원장",
    addedAt: "2026-04-11T04:45:00.000Z",
  },
  {
    memberId: "4T026790",
    reason: "문화체육관광위원회 간사",
    addedAt: "2026-04-11T04:44:00.000Z",
  },
  {
    memberId: "6RD62559",
    reason: "문화체육관광위원회 간사",
    addedAt: "2026-04-11T04:43:00.000Z",
  },
  {
    memberId: "A0P4646G",
    reason: "과학기술정보방송통신위원회 간사",
    addedAt: "2026-04-11T04:42:00.000Z",
  },
  {
    memberId: "L2I9861C",
    reason: "관심 상임위 연계 모니터링",
    addedAt: "2026-04-11T04:41:00.000Z",
  },
  {
    memberId: "YS38221N",
    reason: "과학기술정보방송통신위원회 위원장",
    addedAt: "2026-04-11T04:40:00.000Z",
  },
  {
    memberId: "7YL9580G",
    reason: "과학기술정보방송통신위원회 간사",
    addedAt: "2026-04-11T04:39:00.000Z",
  },
];

const DEMO_BILLS: Bill[] = [
  makeDemoBill({
    id: 9001,
    billId: "PRC_I2I5R1P1P1O2P0N9N1V7U1U7S6T0S2",
    billName: "게임산업진흥에 관한 법률 일부개정법률안",
    proposerName: "진종오",
    proposerParty: "국민의힘",
    committee: "문화체육관광위원회",
    proposalDate: "2026-03-29T00:00:00.000Z",
    relevanceScore: 5,
    summaryText:
      "게임산업진흥에 관한 법률 개정안은 현재의 게임 관련 규제들을 시대에 맞게 개선하려는 목적을 가지고 있습니다. 이는 게임 산업의 성장과 발전을 저해하는 불필요한 규제를 완화하고, 새로운 기술 및 서비스 도입을 촉진해 국내 게임 산업의 경쟁력을 강화하기 위함입니다.",
  }),
  makeDemoBill({
    id: 9002,
    billId: "PRC_F2D6E0C3D0Z3Z1X6Y1W2V5W2D3E3C7",
    billName: "게임산업진흥에 관한 법률 일부개정법률안",
    proposerName: "조계원",
    proposerParty: "더불어민주당",
    committee: "문화체육관광위원회",
    proposalDate: "2026-03-05T00:00:00.000Z",
    relevanceScore: 5,
    summaryText:
      "게임산업진흥에 관한 법률 개정안은 현재 게임 산업을 규제하는 법률을 현대화하고 개선하려는 목적을 가지고 있습니다. 빠르게 변화하는 게임 산업 환경에 맞춰 새로운 기술과 서비스 모델을 포용하고, 산업의 지속적인 성장과 혁신을 지원하는 방향입니다.",
  }),
  makeDemoBill({
    id: 9003,
    billId: "PRC_M2M6K0M2K2K6S0S9R1P1Q0O8P9K9L1",
    billName: "게임산업진흥에 관한 법률 일부개정법률안",
    proposerName: "김성원",
    proposerParty: "국민의힘",
    committee: "문화체육관광위원회",
    proposalDate: "2026-03-03T00:00:00.000Z",
    relevanceScore: 5,
    summaryText:
      "게임산업진흥에 관한 법률 일부개정법률안은 현재 게임 산업을 규제하는 법을 시대에 맞게 손질하고, 새로운 기술이나 서비스가 나올 때마다 법을 바꾸는 번거로움을 줄이려는 목적을 갖습니다.",
  }),
  makeDemoBill({
    id: 9004,
    billId: "PRC_X2T6U0S2T1R1S1R6Y3Z6X2X0W0X8V7",
    billName: "게임산업진흥에 관한 법률 일부개정법률안",
    proposerName: "김성원",
    proposerParty: "국민의힘",
    committee: "문화체육관광위원회",
    proposalDate: "2026-02-24T00:00:00.000Z",
    relevanceScore: 5,
    summaryText:
      "게임산업진흥에 관한 법률 일부개정법률안은 현재의 게임 관련 법규를 시대에 맞게 손질해 게임 산업의 성장을 돕고 건전한 게임 문화를 만들려는 목적을 가지고 있습니다.",
  }),
  makeDemoBill({
    id: 9005,
    billId: "PRC_T2B5A0A9Z1X0T1U2T1S1Q5Y2Z4Y7W2",
    billName: "이스포츠(전자스포츠) 진흥에 관한 법률 일부개정법률안",
    proposerName: "진종오",
    proposerParty: "국민의힘",
    committee: "문화체육관광위원회",
    proposalDate: "2026-03-15T00:00:00.000Z",
    relevanceScore: 4,
    summaryText:
      "이스포츠 진흥법 개정안은 이스포츠 산업의 불법 도박 및 승부조작 문제를 해결하기 위해 처벌을 강화하고, 지자체 차원의 육성 근거를 보강하려는 방향의 개정입니다.",
  }),
];

const DEMO_NEWS_ITEMS: NewsArticle[] = [
  makeDemoNewsItem({
    id: 9901,
    title:
      "[창간20년 인터뷰] 이철우 한국게임이용자협회 협회장 \"이용자 대변하는...\"",
    url: "https://www.todaykorea.co.kr/news/articleView.html?idxno=400378",
    source: "todaykorea.co.kr",
    publishedAt: "2026-04-10T00:00:00.000Z",
  }),
  makeDemoNewsItem({
    id: 9902,
    title: "[기자수첩] 게임산업 부흥, 제도가 바뀔 차례",
    url: "https://www.shinailbo.co.kr/news/articleView.html?idxno=5007895",
    source: "shinailbo.co.kr",
    publishedAt: "2026-04-05T00:00:00.000Z",
  }),
  makeDemoNewsItem({
    id: 9903,
    title:
      "[온라인 게임 30년] '한류 선봉장' 게임산업이지만...이면엔 '낡은 규제...'",
    url: "https://www.techm.kr/news/articleView.html?idxno=150784",
    source: "techm.kr",
    publishedAt: "2026-04-02T00:00:00.000Z",
  }),
  makeDemoNewsItem({
    id: 9904,
    title: "\"개천에서 페이커난다\"... 지역 e스포츠 육성법, 국회 본회의 통과",
    url: "https://www.insight.co.kr/news/548611",
    source: "insight.co.kr",
    publishedAt: "2026-04-02T00:00:00.000Z",
  }),
  makeDemoNewsItem({
    id: 9905,
    title: "‘지역 e스포츠 활성화’ 법제화…지자체가 팀·리그·교육 직접 키운다",
    url: "http://www.metroseoul.co.kr/article/20260402500431",
    source: "metroseoul.co.kr",
    publishedAt: "2026-04-02T00:00:00.000Z",
  }),
  makeDemoNewsItem({
    id: 9906,
    title: "정연욱 의원, e스포츠 진흥법 개정안 통과...지자체 지원 명시",
    url: "https://www.joongdo.co.kr/web/view.php?key=20260402010000707",
    source: "joongdo.co.kr",
    publishedAt: "2026-04-02T00:00:00.000Z",
  }),
];

const DEMO_TRANSCRIPT: CommitteeTranscript = {
  id: 90001,
  minutesId: "56528",
  source: "record_xml",
  committee: "법제사법위원회",
  meetingName: "제22대 제434회 제1차 법제사법위원회 (2026년 04월 08일)",
  meetingDate: "2026-04-08",
  sessionLabel: "제434회 국회 (임시회) · 제1호",
  place: "법제사법위원회회의실",
  agendaItems: [],
  sourceUrl:
    "https://record.assembly.go.kr/assembly/viewer/minutes/xml.do?id=56528&type=view",
  pdfUrl:
    "https://record.assembly.go.kr/assembly/viewer/minutes/download/pdf.do?id=56528",
  videoUrl:
    "http://w3.assembly.go.kr/main/player.do?menu=1&mc=325&ct1=22&ct2=434&ct3=01&wv=1",
  fullText: "",
  utteranceCount: 3,
  fetchedAt: new Date("2026-04-11T04:50:00.000Z"),
};

const DEMO_TRANSCRIPT_UTTERANCES: CommitteeTranscriptUtterance[] = [
  {
    id: 91001,
    transcriptId: DEMO_TRANSCRIPT.id,
    sortOrder: 22,
    speakerName: "이세진",
    speakerRole: "전문위원",
    speakerArea: null,
    speakerProfileUrl: null,
    speakerPhotoUrl: null,
    content:
      "전문위원입니다. 디지털재화와 온라인 콘텐츠 거래 관련 조문을 검토하면서, 현행 규정이 실제 산업 구조를 충분히 반영하는지 여부를 먼저 보겠습니다.",
    matchedKeywords: [],
    hasKeywordMatch: false,
    snippet: null,
  },
  {
    id: 91002,
    transcriptId: DEMO_TRANSCRIPT.id,
    sortOrder: 23,
    speakerName: "이세진",
    speakerRole: "전문위원",
    speakerArea: null,
    speakerProfileUrl: null,
    speakerPhotoUrl: null,
    content:
      "전문위원입니다. 의사일정 제15항 및 제16항과 관련해서 문화체육관광부는 콘텐츠산업 진흥정책과 함께 디지털 서비스 규율 체계도 검토하고 있습니다. 한국인터넷기업협회와 한국게임산업협회는 디지털콘텐츠와 게임 서비스가 동일한 소비자 보호 규율 아래 묶일 때 세부 산업 특성이 충분히 반영돼야 한다는 의견을 제시했습니다. 특히 게임산업은 확률형 아이템, 라이브 서비스 운영, 계정 제재 등 별도 쟁점을 갖고 있어 전자상거래 일반 규율과 동일 선상에서 다루면 집행 혼선이 생길 수 있다는 지적입니다.",
    matchedKeywords: ["게임산업", "게임"],
    hasKeywordMatch: true,
    snippet:
      "…문화체육관광부는 콘텐츠산업 진흥정책과 함께 디지털 서비스 규율 체계도 검토하고 있습니다. 한국인터넷기업협회와 한국게임산업협회는 디지털콘텐츠와 게임 서비스가 동일한 소비자 보호 규율 아래 묶일 때 세부 산업 특성이 충분히 반영돼야 한다는 의견을 제시했습니다…",
  },
  {
    id: 91003,
    transcriptId: DEMO_TRANSCRIPT.id,
    sortOrder: 24,
    speakerName: "김용민",
    speakerRole: "간사",
    speakerArea: null,
    speakerProfileUrl: null,
    speakerPhotoUrl: null,
    content:
      "지금 말씀하신 부분은 전자상거래 일반 규율과 게임산업 개별 규율이 충돌할 수 있다는 취지로 이해됩니다. 후속 심사 과정에서 문체위 의견도 함께 받아보겠습니다.",
    matchedKeywords: ["게임산업"],
    hasKeywordMatch: true,
    snippet:
      "…전자상거래 일반 규율과 게임산업 개별 규율이 충돌할 수 있다는 취지로 이해됩니다. 후속 심사 과정에서 문체위 의견도 함께 받아보겠습니다…",
  },
].map((entry) => ({ ...entry }));

DEMO_TRANSCRIPT.fullText = DEMO_TRANSCRIPT_UTTERANCES.map((entry) => entry.content).join(
  "\n\n",
);
DEMO_TRANSCRIPT.utteranceCount = DEMO_TRANSCRIPT_UTTERANCES.length;

const DEMO_TRANSCRIPT_HITS: DemoTranscriptHit[] = DEMO_TRANSCRIPT_UTTERANCES.filter(
  (entry) => entry.hasKeywordMatch,
).map((entry) => ({
  utteranceId: entry.id,
  transcriptId: entry.transcriptId,
  minutesId: DEMO_TRANSCRIPT.minutesId,
  committee: DEMO_TRANSCRIPT.committee,
  meetingName: DEMO_TRANSCRIPT.meetingName,
  meetingDate: DEMO_TRANSCRIPT.meetingDate,
  sessionLabel: DEMO_TRANSCRIPT.sessionLabel,
  place: DEMO_TRANSCRIPT.place,
  sourceUrl: DEMO_TRANSCRIPT.sourceUrl,
  speakerName: entry.speakerName,
  speakerRole: entry.speakerRole,
  speakerArea: entry.speakerArea,
  content: entry.content,
  matchedKeywords: entry.matchedKeywords,
  snippet: entry.snippet,
}));

export function getDemoTopBills() {
  return DEMO_BILLS.slice(0, 4);
}

export function getDemoRecentBills() {
  return [...DEMO_BILLS];
}

export function getDemoBills() {
  return [...DEMO_BILLS];
}

export function getDemoNewsItems() {
  return [...DEMO_NEWS_ITEMS];
}

export function getDemoWatchSeedCount() {
  return DEMO_WATCH_SEEDS.length;
}

export function buildSeededDemoWatchEntries(
  members: CompatLegislatorSummaryRow[],
): Array<{ legislatorId: number; reason: string; addedAt: string }> {
  const memberIdToId = new Map(members.map((member) => [member.memberId, member.id]));
  return DEMO_WATCH_SEEDS.map((entry) => {
    const legislatorId = memberIdToId.get(entry.memberId);
    if (!legislatorId) return null;
    return {
      legislatorId,
      reason: entry.reason,
      addedAt: entry.addedAt,
    };
  }).filter(
    (
      entry,
    ): entry is {
      legislatorId: number;
      reason: string;
      addedAt: string;
    } => Boolean(entry),
  );
}

export function getDemoTranscriptHits(limitCount = 6) {
  return DEMO_TRANSCRIPT_HITS.slice(0, limitCount);
}

export function getDemoTranscriptOverview() {
  return {
    transcripts: [DEMO_TRANSCRIPT],
    hits: getDemoTranscriptHits(),
    recentCount: 1,
    summaryMap: new Map<number, { hitCount: number; snippets: string[] }>([
      [
        DEMO_TRANSCRIPT.id,
        {
          hitCount: DEMO_TRANSCRIPT_HITS.length,
          snippets: DEMO_TRANSCRIPT_HITS.map((entry) => entry.snippet).filter(
            (entry): entry is string => Boolean(entry),
          ),
        },
      ],
    ]),
  };
}

export function getDemoTranscriptByMinutesId(minutesId: string) {
  if (minutesId !== DEMO_TRANSCRIPT.minutesId) {
    return null;
  }

  return {
    transcript: DEMO_TRANSCRIPT,
    utterances: [...DEMO_TRANSCRIPT_UTTERANCES],
  };
}

function makeDemoBill(input: {
  id: number;
  billId: string;
  billNumber?: string | null;
  billName: string;
  proposerName: string;
  proposerParty: string | null;
  committee: string | null;
  proposalDate: string;
  relevanceScore: number;
  summaryText?: string | null;
}): Bill {
  const timestamp = new Date(input.proposalDate);
  return {
    id: input.id,
    billId: input.billId,
    billNumber: input.billNumber ?? null,
    billName: input.billName,
    proposerName: input.proposerName,
    proposerParty: input.proposerParty,
    coSponsorCount: 0,
    committee: input.committee,
    stage: "stage_2",
    status: "계류중",
    proposalDate: timestamp,
    relevanceScore: input.relevanceScore,
    relevanceReasoning: null,
    proposalReason: null,
    mainContent: null,
    evidenceLevel: "metadata",
    bodyFetchStatus: "empty",
    evidenceMeta: {
      level: "metadata",
      bodyFetchStatus: "empty",
      availableFields: ["billName", "committee", "proposerName", "proposalDate"],
      missingFields: ["proposerParty", "proposalReason", "mainContent"],
      sourceNotes: ["demo data"],
    },
    discoverySources: null,
    discoveryKeywords: null,
    analysisMeta: null,
    summaryText: input.summaryText ?? null,
    companyImpact: null,
    companyImpactIsAiDraft: false,
    deepAnalysis: null,
    deepAnalysisGeneratedAt: null,
    externalLink: null,
    lastSynced: timestamp,
    createdAt: timestamp,
  };
}

function makeDemoNewsItem(input: {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}): NewsArticle {
  return {
    id: input.id,
    billId: null,
    query: "게임 산업",
    title: input.title,
    url: input.url,
    source: input.source,
    description: null,
    publishedAt: new Date(input.publishedAt),
    fetchedAt: new Date(input.publishedAt),
  };
}
