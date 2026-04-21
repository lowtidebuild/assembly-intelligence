/**
 * Shared law keyword blocks — single source of truth.
 *
 * Imported by both src/lib/industry-presets.ts and src/lib/law-mixins.ts.
 * A change here updates both preset keywords and mixin keywords.
 */

export const ECOMMERCE_ACT_KEYWORDS: readonly string[] = [
  "전자상거래",
  "전자상거래법",
  "온라인 쇼핑",
  "오픈마켓",
  "통신판매",
  "통신판매중개",
  "다크패턴",
  "소비자 권익",
  "환불",
  "반품",
  "청약철회",
  "전자상거래 소비자보호",
] as const;

export const FAIR_LABELING_ACT_KEYWORDS: readonly string[] = [
  "표시광고",
  "표시·광고",
  "표시광고법",
  "부당광고",
  "기만적 광고",
  "거짓·과장 광고",
  "비교광고",
  "표시의무",
  "광고 심의",
  "허위표시",
  "부당한 표시·광고",
] as const;

export const INFO_COMM_NETWORK_ACT_KEYWORDS: readonly string[] = [
  "정보통신망",
  "정보통신망법",
  "정보통신서비스",
  "본인확인",
  "이용자 보호",
  "불법정보 유통",
  "스팸",
  "위치정보",
  "청소년유해매체물",
  "웹사이트 차단",
  "임시조치",
] as const;

export const PIPA_KEYWORDS: readonly string[] = [
  "개인정보",
  "개인정보 보호",
  "개인정보보호법",
  "정보주체",
  "개인정보처리자",
  "가명정보",
  "익명정보",
  "개인정보 유출",
  "개인정보 국외이전",
  "민감정보",
  "프로파일링",
  "자동화 의사결정",
] as const;

export const COPYRIGHT_ACT_KEYWORDS: readonly string[] = [
  "저작권",
  "저작권법",
  "저작재산권",
  "저작인격권",
  "공정이용",
  "TDM",
  "Text and Data Mining",
  "저작권 보호",
  "2차적저작물",
  "저작권 침해",
  "저작권 신탁관리",
] as const;

export const ESPORTS_PROMOTION_ACT_KEYWORDS: readonly string[] = [
  "이스포츠",
  "전자스포츠",
  "e스포츠",
  "이스포츠 진흥",
  "이스포츠법",
  "프로게이머",
  "이스포츠 선수",
  "이스포츠 경기",
  "이스포츠 산업",
  "이스포츠 표준계약서",
] as const;

export const YOUTH_PROTECTION_ACT_KEYWORDS: readonly string[] = [
  "청소년 보호",
  "청소년보호법",
  "청소년유해매체물",
  "청소년 이용 제한",
  "셧다운제",
  "청소년 게임시간",
  "연령 등급",
  "청소년 접근 제한",
] as const;

export const CONTENT_INDUSTRY_ACT_KEYWORDS: readonly string[] = [
  "콘텐츠산업",
  "콘텐츠산업진흥",
  "콘텐츠산업진흥법",
  "콘텐츠진흥원",
  "한국콘텐츠진흥원",
  "문화콘텐츠",
  "콘텐츠 수출",
  "콘텐츠 제작 지원",
] as const;
