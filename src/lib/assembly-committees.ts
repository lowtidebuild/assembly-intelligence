/**
 * Canonical list of 22대 국회 (2024-2028) standing committees.
 *
 * Hardcoded rather than fetched from MCP because:
 *   1. Upstream `assembly_org` is slow (first call 60-90s cold)
 *   2. Standing committee names rarely change mid-term
 *   3. The setup wizard needs this list available instantly
 *
 * If committees get reorganized (rare — usually between 국회 cycles),
 * update this file and ship a release.
 *
 * Order mirrors the 국회 공식 배치순 (국회운영위가 1번, 여가위가 17번).
 */

export interface AssemblyCommittee {
  /** Official Korean name (matches what MCP returns) */
  name: string;
  /** Short name for dense UI (6 chars or fewer) */
  shortName: string;
  /** One-line description of the committee's jurisdiction */
  jurisdiction: string;
}

export const STANDING_COMMITTEES: AssemblyCommittee[] = [
  {
    name: "국회운영위원회",
    shortName: "운영위",
    jurisdiction: "국회 운영 전반, 국회법 개정, 의원 세비",
  },
  {
    name: "법제사법위원회",
    shortName: "법사위",
    jurisdiction: "법률안 체계·자구 심사, 법무부·검찰, 대법원",
  },
  {
    name: "정무위원회",
    shortName: "정무위",
    jurisdiction: "국무조정실, 공정거래, 금융위, 권익위",
  },
  {
    name: "기획재정위원회",
    shortName: "기재위",
    jurisdiction: "세제, 조세, 기획재정부, 한국은행",
  },
  {
    name: "교육위원회",
    shortName: "교육위",
    jurisdiction: "초중등·고등·평생교육, 교육부",
  },
  {
    name: "과학기술정보방송통신위원회",
    shortName: "과방위",
    jurisdiction: "ICT, AI, 방송통신, 과기정통부, 방통위",
  },
  {
    name: "외교통일위원회",
    shortName: "외통위",
    jurisdiction: "외교부, 통일부, 재외동포",
  },
  {
    name: "국방위원회",
    shortName: "국방위",
    jurisdiction: "국방부, 병역, 방위산업",
  },
  {
    name: "행정안전위원회",
    shortName: "행안위",
    jurisdiction: "행안부, 경찰청, 소방청, 지방자치",
  },
  {
    name: "문화체육관광위원회",
    shortName: "문체위",
    jurisdiction: "문체부, 게임, 이스포츠, 관광, 언론",
  },
  {
    name: "농림축산식품해양수산위원회",
    shortName: "농해수위",
    jurisdiction: "농림축산식품부, 해양수산부, 농어업",
  },
  {
    name: "산업통상자원중소벤처기업위원회",
    shortName: "산자위",
    jurisdiction: "산업부, 중기부, 무역, 에너지, 스타트업",
  },
  {
    name: "보건복지위원회",
    shortName: "복지위",
    jurisdiction: "보건복지부, 식약처, 의료, 제약, 바이오",
  },
  {
    name: "환경노동위원회",
    shortName: "환노위",
    jurisdiction: "환경부, 고용노동부, ESG",
  },
  {
    name: "국토교통위원회",
    shortName: "국토위",
    jurisdiction: "국토부, 부동산, 교통, 철도, 항공",
  },
  {
    name: "정보위원회",
    shortName: "정보위",
    jurisdiction: "국정원, 정보 관련 법률",
  },
  {
    name: "여성가족위원회",
    shortName: "여가위",
    jurisdiction: "여성가족부, 청소년, 가족",
  },
];

/**
 * Special committees — fall outside the 17 standing committees but
 * still appear in bill.committee values from MCP. Included in the
 * picker for completeness but marked with `isSpecial: true` so the
 * UI can render them in a subdued style.
 */
export const SPECIAL_COMMITTEES: AssemblyCommittee[] = [
  {
    name: "예산결산특별위원회",
    shortName: "예결위",
    jurisdiction: "예산안·결산 심사 특별위원회",
  },
  {
    name: "윤리특별위원회",
    shortName: "윤리특위",
    jurisdiction: "국회의원 윤리 심사",
  },
];

/** Full list in display order (standing first, then special). */
export const ALL_COMMITTEES: AssemblyCommittee[] = [
  ...STANDING_COMMITTEES,
  ...SPECIAL_COMMITTEES,
];

/** Lookup by official name. Returns undefined if unknown. */
export function findCommittee(name: string): AssemblyCommittee | undefined {
  return ALL_COMMITTEES.find((c) => c.name === name);
}
