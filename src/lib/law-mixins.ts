import {
  CONTENT_INDUSTRY_ACT_KEYWORDS,
  COPYRIGHT_ACT_KEYWORDS,
  ECOMMERCE_ACT_KEYWORDS,
  ESPORTS_PROMOTION_ACT_KEYWORDS,
  FAIR_LABELING_ACT_KEYWORDS,
  INFO_COMM_NETWORK_ACT_KEYWORDS,
  PIPA_KEYWORDS,
  YOUTH_PROTECTION_ACT_KEYWORDS,
} from "./law-keyword-blocks";

export interface LawMixin {
  slug: string;
  name: string;
  formalName: string;
  keywords: readonly string[];
  excludeKeywords: readonly string[];
  regulators: readonly string[];
  /**
   * 소관 상임위원회 공식 한글명 배열.
   * STANDING_COMMITTEES[].name 과 정확히 일치해야 하며,
   * sync 시 프로필 위원회와 union되어 fetch gate에 포함된다.
   */
  suggestedCommittees: readonly string[];
  version: string;
}

const RAW_LAW_MIXINS: Record<string, LawMixin> = {
  "ecommerce-act": {
    slug: "ecommerce-act",
    name: "전자상거래법",
    formalName: "전자상거래 등에서의 소비자보호에 관한 법률",
    keywords: ECOMMERCE_ACT_KEYWORDS,
    excludeKeywords: [],
    regulators: ["공정거래위원회"],
    suggestedCommittees: ["정무위원회"],
    version: "ecommerce-act-v1.0",
  },
  "fair-labeling-act": {
    slug: "fair-labeling-act",
    name: "표시·광고법",
    formalName: "표시·광고의 공정화에 관한 법률",
    keywords: FAIR_LABELING_ACT_KEYWORDS,
    excludeKeywords: [],
    regulators: ["공정거래위원회"],
    suggestedCommittees: ["정무위원회"],
    version: "fair-labeling-act-v1.0",
  },
  "info-comm-network-act": {
    slug: "info-comm-network-act",
    name: "정보통신망법",
    formalName: "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
    keywords: INFO_COMM_NETWORK_ACT_KEYWORDS,
    excludeKeywords: [],
    regulators: ["방송통신위원회", "한국인터넷진흥원(KISA)"],
    suggestedCommittees: ["과학기술정보방송통신위원회"],
    version: "info-comm-network-act-v1.0",
  },
  pipa: {
    slug: "pipa",
    name: "개인정보보호법",
    formalName: "개인정보 보호법",
    keywords: PIPA_KEYWORDS,
    excludeKeywords: [],
    regulators: ["개인정보보호위원회(PIPC)"],
    suggestedCommittees: ["정무위원회", "행정안전위원회"],
    version: "pipa-v1.0",
  },
  "copyright-act": {
    slug: "copyright-act",
    name: "저작권법",
    formalName: "저작권법",
    keywords: COPYRIGHT_ACT_KEYWORDS,
    excludeKeywords: [],
    regulators: ["문화체육관광부", "한국저작권위원회"],
    suggestedCommittees: ["문화체육관광위원회"],
    version: "copyright-act-v1.0",
  },
  "esports-promotion-act": {
    slug: "esports-promotion-act",
    name: "이스포츠 진흥법",
    formalName: "이스포츠(전자스포츠) 진흥에 관한 법률",
    keywords: ESPORTS_PROMOTION_ACT_KEYWORDS,
    excludeKeywords: [],
    regulators: ["문화체육관광부", "한국콘텐츠진흥원"],
    suggestedCommittees: ["문화체육관광위원회"],
    version: "esports-promotion-act-v1.0",
  },
  "youth-protection-act": {
    slug: "youth-protection-act",
    name: "청소년 보호법",
    formalName: "청소년 보호법",
    keywords: YOUTH_PROTECTION_ACT_KEYWORDS,
    excludeKeywords: [],
    regulators: ["여성가족부"],
    suggestedCommittees: ["여성가족위원회"],
    version: "youth-protection-act-v1.0",
  },
  "content-industry-act": {
    slug: "content-industry-act",
    name: "콘텐츠산업진흥법",
    formalName: "콘텐츠산업 진흥법",
    keywords: CONTENT_INDUSTRY_ACT_KEYWORDS,
    excludeKeywords: [],
    regulators: ["문화체육관광부", "한국콘텐츠진흥원"],
    suggestedCommittees: ["문화체육관광위원회"],
    version: "content-industry-act-v1.0",
  },
};

export function getMixin(slug: string): LawMixin | undefined {
  const raw = RAW_LAW_MIXINS[slug];
  if (!raw) return undefined;

  return {
    ...raw,
    keywords: Array.from(
      new Set<string>([...raw.keywords, raw.formalName, raw.name]),
    ),
  };
}

export function listMixins(): LawMixin[] {
  return Object.keys(RAW_LAW_MIXINS)
    .map((slug) => getMixin(slug))
    .filter((mixin): mixin is LawMixin => mixin !== undefined);
}

export function listMixinSlugs(): string[] {
  return Object.keys(RAW_LAW_MIXINS);
}

export function mergeKeywordsWithMixins(
  profileKeywords: readonly string[],
  mixinSlugs: readonly string[],
): string[] {
  const mixinKeywords = mixinSlugs.flatMap(
    (slug) => getMixin(slug)?.keywords ?? [],
  );
  return Array.from(new Set([...profileKeywords, ...mixinKeywords]));
}

export function mergeExcludesWithMixins(
  profileExcludes: readonly string[],
  mixinSlugs: readonly string[],
): string[] {
  const mixinExcludes = mixinSlugs.flatMap(
    (slug) => getMixin(slug)?.excludeKeywords ?? [],
  );
  return Array.from(new Set([...profileExcludes, ...mixinExcludes]));
}

export function mergeCommitteesWithMixins(
  profileCommittees: readonly string[],
  mixinSlugs: readonly string[],
): string[] {
  const mixinCommittees = mixinSlugs.flatMap(
    (slug) => getMixin(slug)?.suggestedCommittees ?? [],
  );
  return Array.from(new Set([...profileCommittees, ...mixinCommittees]));
}
