/**
 * Industry presets — seed data for the setup wizard.
 *
 * Each preset is intentionally thin: keywords + suggested committees +
 * LLM context. No legislator lists — those are picked by the user
 * interactively via the hemicycle UI in setup wizard step 4, because:
 *
 *   1. Legislator rosters change each term (4 years). Real-time MCP
 *      data beats any hardcoded list.
 *   2. The user knows their own stakeholder relationships better than
 *      any preset could encode.
 *
 * Version scheme: "{slug}-v{n}". Bump the version when you meaningfully
 * change keywords or llm_context — the app can detect drift and offer
 * upgrades to existing profiles.
 *
 * To add a new industry: (1) add an entry here, (2) verify committees
 * match current National Assembly structure, (3) that's it. Zero code
 * changes elsewhere.
 */

export interface IndustryPreset {
  /** Stable identifier used in URLs and DB */
  slug: string;
  /** Korean display name (primary UI label) */
  name: string;
  /** English name (fallback + i18n) */
  nameEn: string;
  /** Emoji icon shown in picker and sidebar */
  icon: string;
  /** One-line description shown in picker card */
  description: string;
  /** Keywords for the sync pipeline's pre-filter (before Gemini scoring) */
  keywords: string[];
  /** Standing committees most likely to hold relevant bills */
  suggestedCommittees: string[];
  /** System prompt prefix for Gemini — 2-3 paragraphs of domain context */
  llmContext: string;
  /** Version tag — bump when keywords/context change meaningfully */
  presetVersion: string;
}

/**
 * 7 shipping presets covering the most common Korean tech/enterprise
 * verticals with active legislative footprints.
 */
export const INDUSTRY_PRESETS: Record<string, IndustryPreset> = {
  /* ─────────────────────────────────────────────────────────── */
  game: {
    slug: "game",
    name: "게임",
    nameEn: "Game",
    icon: "🎮",
    description: "게임산업법, 확률형 아이템, 등급분류, 이스포츠, P2E",
    keywords: [
      "게임산업",
      "게임산업진흥",
      "게임산업법",
      "확률형 아이템",
      "게임 등급분류",
      "등급분류",
      "게임물관리위원회",
      "이스포츠",
      "전자스포츠",
      "e스포츠",
      "P2E",
      "블록체인 게임",
      "NFT 게임",
      "메타버스",
      "콘텐츠산업진흥",
      "콘텐츠진흥원",
      "청소년 게임시간",
      "셧다운제",
      "사행산업통합감독위원회",
      "게임 과몰입",
    ],
    suggestedCommittees: [
      "문화체육관광위원회",
      "과학기술정보방송통신위원회",
      "여성가족위원회",
      "법제사법위원회",
    ],
    llmContext: `
게임 산업은 온라인·모바일·콘솔 게임 개발사, 퍼블리셔, 이스포츠 기업,
게임 플랫폼 사업자를 포함합니다.

주요 이슈: 확률형 아이템 정보공개 의무화, 게임 등급분류 민간 이양
논의, 청소년 게임시간 제한(셧다운제 폐지 이후 후속 논의), 자율규제
대 법제화 논쟁, P2E/블록체인 게임의 가상자산법 적용 여부, 게임물관리
위원회 조직개편, 콘텐츠진흥원 예산 및 게임산업 지원, 게임 중독 의료
분류 논쟁, 게임 광고 규제.

관련 법률: 게임산업진흥에 관한 법률, 콘텐츠산업진흥법, 청소년 보호법,
정보통신망 이용촉진 및 정보보호법, 사행행위 등 규제 및 처벌 특례법.

주요 규제기관: 문화체육관광부, 게임물관리위원회, 한국콘텐츠진흥원,
방송통신위원회(게임 광고 관련), 여성가족부(청소년 보호).
    `.trim(),
    presetVersion: "game-v1.1",
  },

  /* ─────────────────────────────────────────────────────────── */
  cybersecurity: {
    slug: "cybersecurity",
    name: "정보보안 · 사이버시큐리티",
    nameEn: "Information Security & Cybersecurity",
    icon: "🛡️",
    description:
      "정보통신망법, 개인정보보호, 망분리, ISMS-P, 해킹·랜섬웨어 대응",
    keywords: [
      "정보보호",
      "사이버 보안",
      "사이버보안",
      "개인정보 보호",
      "개인정보보호법",
      "정보통신망",
      "정보통신망법",
      "전자서명",
      "전자금융거래",
      "데이터 3법",
      "망분리",
      "해킹",
      "랜섬웨어",
      "디지털 포렌식",
      "CISO",
      "정보보호 최고책임자",
      "ISMS",
      "ISMS-P",
      "PIMS",
      "정보통신기반보호",
      "암호모듈",
      "전자정부",
      "클라우드 보안",
      "CSAP",
      "제로 트러스트",
      "공급망 보안",
      "보안 취약점",
      "사이버 침해",
    ],
    suggestedCommittees: [
      "과학기술정보방송통신위원회",
      "정무위원회",
      "행정안전위원회",
      "법제사법위원회",
      "국방위원회",
    ],
    llmContext: `
정보보안/사이버시큐리티 산업은 기업·공공기관의 정보자산 보호, 개인정보
관리, 사이버 공격 대응, 보안 솔루션 개발·공급, 보안 컨설팅, 인증심사를
포함합니다.

주요 이슈: 개인정보 보호 규제(개인정보보호법·신용정보법·정보통신망법
즉 "데이터 3법"), 개인정보 국외이전 규제 강화, CISO 지정 의무 확대,
ISMS-P 통합인증 제도 개편, 망분리 의무화 완화 논쟁, 클라우드 보안
인증(CSAP) 체계, 제로 트러스트 아키텍처 도입, AI 학습 데이터 활용과
개인정보 충돌, 해킹·랜섬웨어 피해 신고 의무화, 보안 투자 세액공제,
공공 분야 정보보안 강화, 공급망 보안(SBOM 등), 산업기술 유출 방지,
전자서명·디지털 신원 체계.

관련 법률:
- 개인정보 보호법
- 정보통신망 이용촉진 및 정보보호 등에 관한 법률 (정보통신망법)
- 정보통신기반 보호법
- 전자금융거래법
- 전자서명법
- 신용정보의 이용 및 보호에 관한 법률 (신용정보법)
- 클라우드컴퓨팅 발전 및 이용자 보호에 관한 법률
- 지능정보화 기본법 (舊 국가정보화 기본법)
- 산업기술의 유출방지 및 보호에 관한 법률

주요 규제기관: 개인정보보호위원회(PIPC), 한국인터넷진흥원(KISA),
과학기술정보통신부, 금융감독원(핀테크 보안), 국가정보원(공공 분야),
국가사이버안보센터.
    `.trim(),
    presetVersion: "cybersecurity-v1.0",
  },

  /* ─────────────────────────────────────────────────────────── */
  bio: {
    slug: "bio",
    name: "바이오 · 제약",
    nameEn: "Biotech & Pharmaceuticals",
    icon: "💊",
    description: "약사법, 생명윤리법, 첨단재생의료법, 임상, 건강보험 약가",
    keywords: [
      "바이오",
      "제약",
      "약사법",
      "임상시험",
      "신약",
      "제네릭",
      "생명윤리",
      "생명윤리법",
      "첨단재생의료",
      "유전자치료",
      "세포치료",
      "의료기기",
      "의약품",
      "건강보험 약가",
      "약가 제도",
      "실거래가",
      "바이오시밀러",
      "식품의약품안전처",
      "식약처",
      "규제샌드박스",
      "바이오의약품",
      "위탁생산",
      "CDMO",
      "mRNA",
    ],
    suggestedCommittees: [
      "보건복지위원회",
      "산업통상자원중소벤처기업위원회",
      "과학기술정보방송통신위원회",
      "법제사법위원회",
    ],
    llmContext: `
바이오·제약 산업은 신약 개발, 임상시험, 제약 제조·유통, 바이오의약품,
의료기기, 진단, 세포·유전자치료, 위탁개발생산(CDMO)을 포함합니다.

주요 이슈: 약사법 개정(약가 제도, 실거래가 조사), 첨단재생의료 및
첨단바이오의약품 안전 및 지원에 관한 법률 개정, 생명윤리 및 안전에
관한 법률(유전자치료·인간 배아 관련), 임상시험 규제 완화·강화 논쟁,
건강보험 약가 협상 및 선별등재, 바이오시밀러 허가 체계, 제약회사
리베이트 방지, 공중보건 위기대응 의약품 비축, 바이오 규제샌드박스,
신약 연구개발 세액공제, 의약품 부작용 피해구제.

관련 법률:
- 약사법
- 생명윤리 및 안전에 관한 법률
- 첨단재생의료 및 첨단바이오의약품 안전 및 지원에 관한 법률
- 의료기기법
- 국민건강보험법 (약가 관련)
- 마약류 관리에 관한 법률 (바이오 관련 의약품)
- 생명공학육성법

주요 규제기관: 식품의약품안전처, 보건복지부, 건강보험심사평가원,
질병관리청, 국가생명윤리심의위원회.
    `.trim(),
    presetVersion: "bio-v1.0",
  },

  /* ─────────────────────────────────────────────────────────── */
  fintech: {
    slug: "fintech",
    name: "핀테크 · 금융",
    nameEn: "Fintech & Finance",
    icon: "💰",
    description:
      "전자금융거래법, 신용정보법, 가상자산, 마이데이터, 오픈뱅킹",
    keywords: [
      "핀테크",
      "전자금융",
      "전자금융거래법",
      "전자금융업",
      "간편결제",
      "간편송금",
      "선불전자지급수단",
      "가상자산",
      "가상자산이용자보호법",
      "암호화폐",
      "스테이블코인",
      "ICO",
      "STO",
      "토큰증권",
      "마이데이터",
      "개인신용정보",
      "신용정보법",
      "오픈뱅킹",
      "인터넷전문은행",
      "P2P 금융",
      "온라인투자연계금융",
      "보험 GA",
      "인슈어테크",
      "로보어드바이저",
      "마이페이먼트",
    ],
    suggestedCommittees: [
      "정무위원회",
      "기획재정위원회",
      "과학기술정보방송통신위원회",
      "법제사법위원회",
    ],
    llmContext: `
핀테크·금융 산업은 전자금융업, 간편결제·송금, 가상자산, 토큰증권,
P2P 금융, 인터넷전문은행, 오픈뱅킹, 마이데이터, 인슈어테크,
로보어드바이저를 포함합니다.

주요 이슈: 가상자산이용자보호법 2단계 입법(발행·공시 규제, 스테이블
코인), 토큰증권(STO) 제도화, 전자금융거래법 개정(망분리 완화, 전자금융
사고 책임), 마이데이터 사업자 규제, 개인신용정보 활용 범위, 오픈뱅킹
수수료 구조, 인터넷전문은행 자본 요건, 보험업법 개정(GA·빅테크),
금융규제 샌드박스, 혁신금융서비스 지정, 금산분리 논쟁, 플랫폼 금융
독과점.

관련 법률:
- 전자금융거래법
- 가상자산 이용자 보호 등에 관한 법률
- 신용정보의 이용 및 보호에 관한 법률 (신용정보법)
- 자본시장과 금융투자업에 관한 법률 (자본시장법)
- 은행법, 보험업법, 여신전문금융업법
- 온라인투자연계금융업 및 이용자 보호에 관한 법률
- 금융혁신지원 특별법 (샌드박스)
- 특정금융거래정보의 보고 및 이용 등에 관한 법률 (특금법)

주요 규제기관: 금융위원회, 금융감독원, 한국은행, 금융정보분석원(FIU).
    `.trim(),
    presetVersion: "fintech-v1.0",
  },

  /* ─────────────────────────────────────────────────────────── */
  semiconductor: {
    slug: "semiconductor",
    name: "반도체",
    nameEn: "Semiconductor",
    icon: "💻",
    description:
      "반도체특별법, 국가핵심기술, 수출통제, R&D 세액공제, 인력양성",
    keywords: [
      "반도체",
      "반도체산업",
      "반도체특별법",
      "국가첨단전략산업",
      "첨단전략산업",
      "국가핵심기술",
      "수출통제",
      "전략물자",
      "파운드리",
      "메모리",
      "시스템반도체",
      "팹리스",
      "OSAT",
      "소부장",
      "소재부품장비",
      "클린룸",
      "EUV",
      "HBM",
      "칩스법",
      "인력양성",
      "반도체 계약학과",
      "용수 공급",
      "전력 공급",
      "용인 반도체",
      "산업용지",
    ],
    suggestedCommittees: [
      "산업통상자원중소벤처기업위원회",
      "과학기술정보방송통신위원회",
      "기획재정위원회",
      "국토교통위원회",
      "외교통일위원회",
    ],
    llmContext: `
반도체 산업은 메모리·시스템반도체 제조(종합반도체·파운드리), 팹리스
설계, 후공정(OSAT), 소재·부품·장비(소부장), 반도체 인력양성,
첨단 공정 연구개발을 포함합니다.

주요 이슈: 국가첨단전략산업 경쟁력 강화 및 보호에 관한 특별법(반도체
특별법) 개정, 국가핵심기술 지정 및 수출통제, 미국 칩스법·EU 칩스법
대응, 반도체 R&D 세액공제(K-칩스법), 반도체 클러스터 인허가 및
용수·전력 공급, 소부장 국산화 지원, 반도체 계약학과 등 인력양성,
대졸 인력 공급 부족, 산업기술 유출 방지, 전략물자 수출허가, 미중
기술패권 갈등 대응, 용인 반도체 클러스터 국가산업단지.

관련 법률:
- 국가첨단전략산업 경쟁력 강화 및 보호에 관한 특별법 (반도체특별법)
- 산업기술의 유출방지 및 보호에 관한 법률
- 대외무역법 (전략물자 수출통제)
- 조세특례제한법 (R&D 세액공제)
- 산업입지 및 개발에 관한 법률 (클러스터 용지)
- 전기사업법 (전력 공급)
- 물관리기본법 (용수)
- 외국인투자 촉진법

주요 규제기관: 산업통상자원부, 기획재정부, 과학기술정보통신부,
국가정보원(산업기술 유출), 국토교통부(용지), 환경부(용수).
    `.trim(),
    presetVersion: "semiconductor-v1.0",
  },

  /* ─────────────────────────────────────────────────────────── */
  commerce: {
    slug: "commerce",
    name: "이커머스 · 유통",
    nameEn: "E-commerce & Retail",
    icon: "🛒",
    description:
      "전자상거래법, 유통산업발전법, 배달 플랫폼, 대규모유통업법",
    keywords: [
      "전자상거래",
      "전자상거래법",
      "온라인 쇼핑",
      "오픈마켓",
      "유통산업",
      "유통산업발전법",
      "대형마트",
      "의무휴업",
      "영업시간 제한",
      "대규모유통업법",
      "판매수수료",
      "납품업자",
      "PB상품",
      "자체브랜드",
      "배달 플랫폼",
      "배달앱",
      "플랫폼 종사자",
      "배달 라이더",
      "라이브커머스",
      "크로스보더",
      "해외직구",
      "알리",
      "테무",
      "공정거래",
      "독점 규제",
    ],
    suggestedCommittees: [
      "산업통상자원중소벤처기업위원회",
      "정무위원회",
      "환경노동위원회",
      "기획재정위원회",
      "법제사법위원회",
    ],
    llmContext: `
이커머스·유통 산업은 오픈마켓 플랫폼, 종합몰, 대형마트, SSM,
전통시장, 배달앱 플랫폼, 라이브커머스, 크로스보더 이커머스(해외직구·
역직구), 물류·풀필먼트를 포함합니다.

주요 이슈: 전자상거래 등에서의 소비자보호에 관한 법률 개정(반품·환불,
다크패턴 금지), 유통산업발전법 개정(대형마트 의무휴업 완화 논쟁,
SSM 출점 제한), 대규모유통업법(판매수수료 및 납품업자 보호),
플랫폼 공정경쟁 규제(온라인 플랫폼 공정화법), 배달앱 수수료 규제 및
라이더 보호, 알리·테무 등 중국 이커머스 대응, 해외직구 통관·소비세,
개인정보 활용과 맞춤형 광고, 라이브커머스 규제, PB상품 표시 및
원산지, 가짜 리뷰·어뷰징 규제.

관련 법률:
- 전자상거래 등에서의 소비자보호에 관한 법률 (전자상거래법)
- 유통산업발전법
- 대규모유통업에서의 거래 공정화에 관한 법률 (대규모유통업법)
- 독점규제 및 공정거래에 관한 법률
- 표시·광고의 공정화에 관한 법률
- 약관의 규제에 관한 법률
- 개인정보 보호법 (맞춤형 광고)

주요 규제기관: 공정거래위원회, 산업통상자원부, 중소벤처기업부,
관세청(해외직구), 개인정보보호위원회.
    `.trim(),
    presetVersion: "commerce-v1.0",
  },

  /* ─────────────────────────────────────────────────────────── */
  ai: {
    slug: "ai",
    name: "인공지능",
    nameEn: "Artificial Intelligence",
    icon: "🤖",
    description: "AI 기본법, 저작권법, AI 생성물, 알고리즘, 고위험 AI",
    keywords: [
      "인공지능",
      "AI",
      "인공지능 기본법",
      "AI 기본법",
      "고위험 AI",
      "AI 학습 데이터",
      "생성형 AI",
      "LLM",
      "파운데이션 모델",
      "AI 저작권",
      "AI 생성물",
      "AI 안전",
      "AI 윤리",
      "알고리즘 투명성",
      "딥페이크",
      "AI 규제",
      "Text and Data Mining",
      "TDM",
      "데이터 산업 진흥",
      "지능정보화",
      "AI 인재",
      "GPU 인프라",
      "AI 허브",
      "국가 AI",
    ],
    suggestedCommittees: [
      "과학기술정보방송통신위원회",
      "문화체육관광위원회",
      "정무위원회",
      "법제사법위원회",
    ],
    llmContext: `
인공지능 산업은 파운데이션 모델 개발사, 생성형 AI 서비스, AI 반도체,
AI 데이터 라벨링, AI 안전 연구, 엔터프라이즈 AI 솔루션, AI 학습
인프라(GPU·클러스터), AI 인력양성을 포함합니다.

주요 이슈: 인공지능 산업 육성 및 신뢰 기반 조성 등에 관한 법률(AI
기본법) 제정·시행, 고위험 AI 정의 및 의무, AI 학습 데이터의 저작권
면책(Text and Data Mining 예외), AI 생성물 저작권 귀속, 딥페이크
규제(공직선거법·성폭력처벌법), AI 알고리즘 투명성 및 설명가능성,
자동화 의사결정에 대한 개인정보보호법 적용, 국가 AI 컴퓨팅 인프라
구축, GPU 수급, AI 인력양성 및 대학원 지원, AI 안전연구소 설립,
EU AI Act와의 정합성, 국제 AI 거버넌스.

관련 법률:
- 인공지능 산업 육성 및 신뢰 기반 조성 등에 관한 법률 (AI 기본법)
- 저작권법 (AI 학습·생성물)
- 개인정보 보호법 (자동화 의사결정, 프로파일링)
- 지능정보화 기본법
- 데이터 산업 진흥 및 이용촉진에 관한 기본법 (데이터기본법)
- 공직선거법, 성폭력범죄의 처벌 등에 관한 특례법 (딥페이크)
- 정보통신망 이용촉진 및 정보보호 등에 관한 법률

주요 규제기관: 과학기술정보통신부, 개인정보보호위원회, 방송통신위원회,
문화체육관광부(저작권), 공정거래위원회(알고리즘 담합).
    `.trim(),
    presetVersion: "ai-v1.0",
  },
};

/**
 * Returns an array of all presets for UI pickers.
 * Sorted by declaration order (which is curated for display priority).
 */
export function listPresets(): IndustryPreset[] {
  return Object.values(INDUSTRY_PRESETS);
}

/**
 * Lookup a preset by slug. Returns undefined for unknown slugs (e.g.
 * custom profiles that don't map to any shipped preset).
 */
export function getPreset(slug: string): IndustryPreset | undefined {
  return INDUSTRY_PRESETS[slug];
}
