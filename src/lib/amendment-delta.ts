import { z } from "zod";

export const AMENDMENT_DELTA_VERSION = "v1" as const;

export const AMENDMENT_DELTA_SOURCES = [
  "proposal_reason",
  "main_content",
  "attachment",
  "manual",
] as const;

export const AMENDMENT_CHANGE_TYPES = [
  "신설",
  "개정",
  "삭제",
  "의무화",
  "지원",
  "처벌",
  "절차",
  "정의",
  "권한",
] as const;

export type AmendmentDeltaSource = (typeof AMENDMENT_DELTA_SOURCES)[number];
export type AmendmentChangeType = (typeof AMENDMENT_CHANGE_TYPES)[number];

export const amendmentDeltaSchema = z.object({
  version: z.literal(AMENDMENT_DELTA_VERSION),
  source: z.enum(AMENDMENT_DELTA_SOURCES),
  changeTypes: z.array(z.enum(AMENDMENT_CHANGE_TYPES)).default([]),
  affectedArticles: z.array(z.string()).default([]),
  keyChanges: z.array(z.string()).default([]),
  affectedParties: z.array(z.string()).default([]),
  operationalImpacts: z.array(z.string()).default([]),
  complianceImpacts: z.array(z.string()).default([]),
  financialImpacts: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  confidence: z.enum(["low", "medium", "high"]),
});

export type AmendmentDelta = z.infer<typeof amendmentDeltaSchema>;

export interface AmendmentDeltaInput {
  billName?: string;
  proposalReason: string | null;
  mainContent: string | null;
}

const ARTICLE_PATTERN =
  /(?:안\s*)?제\s*\d+(?:조(?:의\s*\d+)?)?(?:\s*제\s*\d+항)?(?:\s*부터\s*제\s*\d+항\s*까지)?/g;
const ARTICLE_TEST_PATTERN =
  /(?:안\s*)?제\s*\d+(?:조(?:의\s*\d+)?)?(?:\s*제\s*\d+항)?(?:\s*부터\s*제\s*\d+항\s*까지)?/;

const CHANGE_MARKER_PATTERN =
  /(신설|개정|삭제|폐지|의무|하여야|하도록|지원|보조|과태료|벌칙|처벌|신고|등록|심사|절차|정의|권한|근거|마련|확대|강화|개선|보완|점검|교육|계획|공유|제공)/;

const PARTY_PATTERNS: Array<[string, RegExp]> = [
  [
    "사업자/플랫폼 운영자",
    /(사업자|플랫폼|제공자|정보통신서비스 제공자|게임사업자)/,
  ],
  ["행사 주최자/운영자", /(개최자|주최자|운영자|경기장|행사)/],
  [
    "정부/소관 부처",
    /(장관|국가|지방자치단체|정부|문화체육관광부|방송통신위원회|위원회)/,
  ],
  ["이용자/소비자", /(이용자|소비자|사용자|국민)/],
  ["청소년", /(청소년|미성년)/],
  ["장애인", /(장애인|접근성)/],
  ["학교/교육기관", /(학교|교육기관|학교의 장)/],
  ["권리자", /(저작권자|권리자|저작인접권)/],
  [
    "정보보호/침해사고 대응기관",
    /(침해사고|정보보호|한국인터넷진흥원|ISAC|공유체계)/,
  ],
];

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim() ?? "";
}

function normalizeItem(value: string): string {
  return value
    .replace(/^[가-하]\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function clip(value: string, maxLength = 180): string {
  const trimmed = normalizeItem(value);
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function selectSource(input: AmendmentDeltaInput): {
  source: AmendmentDeltaSource;
  text: string;
} | null {
  const proposalReason = normalizeText(input.proposalReason);
  const mainContent = normalizeText(input.mainContent);
  const text = [proposalReason, mainContent].filter(Boolean).join("\n");
  if (!text) return null;

  return {
    source: mainContent ? "main_content" : "proposal_reason",
    text,
  };
}

export function extractAffectedArticles(text: string): string[] {
  return unique(
    Array.from(text.matchAll(ARTICLE_PATTERN), (match) =>
      normalizeItem(match[0]),
    ).filter(Boolean),
  ).slice(0, 12);
}

export function classifyChangeTypes(text: string): AmendmentChangeType[] {
  const types: AmendmentChangeType[] = [];

  if (/(신설|새로|근거를 마련|제도를 도입|체계를 마련)/.test(text)) {
    types.push("신설");
  }
  if (/(개정|변경|정비|확대|강화|개선|보완|포함하도록)/.test(text)) {
    types.push("개정");
  }
  if (/(삭제|폐지|제외하도록|없애)/.test(text)) {
    types.push("삭제");
  }
  if (
    /(의무|하여야|하도록 하|실시하도록|수립하도록|가입하도록|제출하도록|공개하도록)/.test(
      text,
    )
  ) {
    types.push("의무화");
  }
  if (/(지원|보조|행정적ㆍ재정적|재정적 지원|지원할 수 있도록)/.test(text)) {
    types.push("지원");
  }
  if (/(처벌|과태료|벌칙|제재|징역|벌금|과징금)/.test(text)) {
    types.push("처벌");
  }
  if (/(신고|등록|심사|절차|계획 수립|점검|조사|공유체계|보고)/.test(text)) {
    types.push("절차");
  }
  if (/(정의|용어|범위에 포함)/.test(text)) {
    types.push("정의");
  }
  if (/(권한|장관|위원회가|할 수 있도록|위임)/.test(text)) {
    types.push("권한");
  }

  return unique(types);
}

export function splitLikelyChangeSentences(text: string): string[] {
  const pieces = text
    .replace(/\n\s*([가-하])\.\s*/g, "\n$1. ")
    .split(/\n+|(?=\s*[가-하]\.\s)/)
    .flatMap((piece) => piece.split(/(?<=[.!?])\s+/))
    .map(normalizeItem)
    .filter((piece) => piece.length >= 8);

  const scored = pieces
    .map((piece) => ({
      piece,
      score:
        (ARTICLE_TEST_PATTERN.test(piece) ? 3 : 0) +
        (CHANGE_MARKER_PATTERN.test(piece) ? 2 : 0) +
        (/(안\s*제|주요내용|내용은 다음과 같)/.test(piece) ? 1 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.piece);

  const fallback = pieces.slice(0, 2);
  return unique(
    (scored.length > 0 ? scored : fallback).map((piece) => clip(piece)),
  ).slice(0, 5);
}

function inferAffectedParties(text: string): string[] {
  return PARTY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([label]) => label,
  );
}

function inferOperationalImpacts(text: string): string[] {
  const impacts: string[] = [];
  if (/(계획|교육|점검|실태조사|보고|신고|등록|자료 제출|공개)/.test(text)) {
    impacts.push("계획 수립, 교육, 점검, 신고/보고 등 운영 프로세스 점검 필요");
  }
  if (/(접근성|보호|안전|표시|정보 제공|공유체계|시스템)/.test(text)) {
    impacts.push("서비스/행사/시스템 운영 기준 변경 가능성 검토");
  }
  if (/(위탁|대리|제휴|수탁|공동)/.test(text)) {
    impacts.push("위탁사, 제휴사, 파트너 계약 및 책임 범위 점검 필요");
  }
  return unique(impacts);
}

function inferComplianceImpacts(text: string): string[] {
  const impacts: string[] = [];
  if (/(의무|하여야|금지|시정명령|신고|등록|제출|공개)/.test(text)) {
    impacts.push("신규 의무/금지사항의 적용 대상과 이행 시점 확인 필요");
  }
  if (/(대통령령|부령|시행령|정하는|위임)/.test(text)) {
    impacts.push("하위법령에서 정할 세부 기준 모니터링 필요");
  }
  if (/(벌칙|과태료|과징금|처벌|제재)/.test(text)) {
    impacts.push("위반 시 제재 수준과 내부 통제 기준 검토 필요");
  }
  return unique(impacts);
}

function inferFinancialImpacts(text: string): string[] {
  const impacts: string[] = [];
  if (/(안전관리|교육|시스템|설비|접근성|점검|조사|인력)/.test(text)) {
    impacts.push("안전관리, 교육, 시스템/설비 개선 관련 비용 발생 가능성");
  }
  if (/(지원|보조|재정|예산|기금)/.test(text)) {
    impacts.push("정부 지원, 보조금, 기금 활용 가능성 검토");
  }
  return unique(impacts);
}

function inferUnknowns(text: string, affectedArticles: string[]): string[] {
  const unknowns: string[] = [];
  if (affectedArticles.length === 0) {
    unknowns.push("구체 조문 번호");
  }
  if (!/(시행일|공포 후|개월|경과조치)/.test(text)) {
    unknowns.push("시행일/경과조치");
  }
  if (!/(벌칙|과태료|과징금|처벌|제재)/.test(text)) {
    unknowns.push("위반 시 제재 여부");
  }
  if (/(대통령령|부령|시행령|정하는|일정 규모|필요한 사항)/.test(text)) {
    unknowns.push("하위법령에서 정할 세부 기준");
  }
  if (!/(비용|지원|보조|예산|재정|기금)/.test(text)) {
    unknowns.push("비용/재정 지원 규모");
  }
  return unique(unknowns).slice(0, 5);
}

function inferConfidence(input: {
  text: string;
  affectedArticles: string[];
  keyChanges: string[];
}): AmendmentDelta["confidence"] {
  if (
    input.text.length >= 300 &&
    input.affectedArticles.length > 0 &&
    input.keyChanges.length >= 2
  ) {
    return "high";
  }
  if (input.text.length >= 120 && input.keyChanges.length > 0) {
    return "medium";
  }
  return "low";
}

export function buildRuleBasedAmendmentDelta(
  input: AmendmentDeltaInput,
): AmendmentDelta | null {
  const source = selectSource(input);
  if (!source) return null;

  const affectedArticles = extractAffectedArticles(source.text);
  const keyChanges = splitLikelyChangeSentences(source.text);

  return {
    version: AMENDMENT_DELTA_VERSION,
    source: source.source,
    changeTypes: classifyChangeTypes(source.text),
    affectedArticles,
    keyChanges,
    affectedParties: inferAffectedParties(source.text),
    operationalImpacts: inferOperationalImpacts(source.text),
    complianceImpacts: inferComplianceImpacts(source.text),
    financialImpacts: inferFinancialImpacts(source.text),
    unknowns: inferUnknowns(source.text, affectedArticles),
    confidence: inferConfidence({
      text: source.text,
      affectedArticles,
      keyChanges,
    }),
  };
}

function mergeList(
  primary: string[],
  fallback: string[],
  limit = 8,
): string[] {
  return unique(
    [...primary, ...fallback].map(normalizeItem).filter(Boolean),
  ).slice(0, limit);
}

export function coerceAmendmentDelta(value: unknown): AmendmentDelta | null {
  const parsed = amendmentDeltaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function ensureAmendmentDelta(
  input: AmendmentDeltaInput,
  candidateValue?: unknown,
): AmendmentDelta | null {
  const fallback = buildRuleBasedAmendmentDelta(input);
  const candidate = coerceAmendmentDelta(candidateValue);

  if (!fallback) return null;
  if (!candidate) return fallback;

  return {
    version: AMENDMENT_DELTA_VERSION,
    source: candidate.source ?? fallback.source,
    changeTypes: unique([
      ...candidate.changeTypes,
      ...fallback.changeTypes,
    ]).slice(0, 8),
    affectedArticles: mergeList(
      candidate.affectedArticles,
      fallback.affectedArticles,
      12,
    ),
    keyChanges:
      candidate.keyChanges.length > 0
        ? mergeList(candidate.keyChanges, fallback.keyChanges, 5)
        : fallback.keyChanges,
    affectedParties: mergeList(
      candidate.affectedParties,
      fallback.affectedParties,
      8,
    ),
    operationalImpacts: mergeList(
      candidate.operationalImpacts,
      fallback.operationalImpacts,
      6,
    ),
    complianceImpacts: mergeList(
      candidate.complianceImpacts,
      fallback.complianceImpacts,
      6,
    ),
    financialImpacts: mergeList(
      candidate.financialImpacts,
      fallback.financialImpacts,
      6,
    ),
    unknowns: mergeList(candidate.unknowns, fallback.unknowns, 6),
    confidence:
      candidate.confidence === "low" && fallback.confidence !== "low"
        ? fallback.confidence
        : candidate.confidence,
  };
}

export function hasUsefulAmendmentDelta(
  delta: AmendmentDelta | null | undefined,
): delta is AmendmentDelta {
  return Boolean(
    delta &&
      (delta.keyChanges.length > 0 ||
        delta.affectedArticles.length > 0 ||
        delta.operationalImpacts.length > 0 ||
        delta.complianceImpacts.length > 0 ||
        delta.financialImpacts.length > 0),
  );
}
