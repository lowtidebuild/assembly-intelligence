/**
 * Deep bill analysis prompt — generates a multi-section analysis
 * for the 법안 영향 분석기 page. Triggered on-demand when user
 * clicks "심층 분석" on a specific bill.
 *
 * Uses Gemini Pro. More expensive, higher quality. NOT run during
 * morning sync (bill-summary.ts handles the sync-time quick summary).
 *
 * Output: structured JSON with 5 sections so the UI can render each
 * as its own card.
 */

export interface BillAnalysisInput {
  billName: string;
  committee: string | null;
  proposerName: string;
  proposerParty: string | null;
  coSponsorCount: number;
  proposalDate: string | null;
  stage: string;
  proposalReason: string | null;
  mainContent: string | null;
  industryName: string;
  industryContext: string;
}

export function buildBillAnalysisPrompt(input: BillAnalysisInput): string {
  const {
    billName,
    committee,
    proposerName,
    proposerParty,
    coSponsorCount,
    proposalDate,
    stage,
    proposalReason,
    mainContent,
    industryName,
    industryContext,
  } = input;

  const body: string[] = [];
  if (proposalReason?.trim()) body.push(`제안이유: ${proposalReason.trim()}`);
  if (mainContent?.trim()) body.push(`주요내용: ${mainContent.trim()}`);
  const bodyBlock =
    body.length > 0
      ? body.join("\n\n")
      : "(본문 미제공 — 의안명/제안자/소관위원회로 추정)";

  return `당신은 한국 국회 ${industryName} 관련 법안을 깊이 있게 분석하는 전문 분석가입니다. 당사 임원/법무팀 보고용 심층 분석을 작성하세요.

## 산업 컨텍스트
${industryContext.trim()}

## 법안 정보
- 의안명: ${billName}
- 소관위원회: ${committee ?? "(미정)"}
- 대표발의자: ${proposerName}${proposerParty ? ` (${proposerParty})` : ""}
- 공동발의자 수: ${coSponsorCount}명
- 발의일: ${proposalDate ?? "(미정)"}
- 현재 단계: ${stage}

${bodyBlock}

## 작업
5개 섹션의 심층 분석을 JSON으로 반환하세요.

## 출력 형식 (반드시 JSON만)
{
  "executive_summary": "<임원용 한 문단 요약. 3-4문장. 이게 뭐고, 왜 중요하고, 무엇을 해야 하는가>",
  "key_provisions": [
    "<조항 1: 구체적 조항명과 내용>",
    "<조항 2: ...>",
    "<조항 3: ...>"
  ],
  "impact_analysis": {
    "operational": "<운영 영향: 업무 프로세스 변화, 새로운 의무, 구현 난이도>",
    "financial": "<재무 영향: 비용 증가, 매출 영향, 투자 필요성>",
    "compliance": "<컴플라이언스 영향: 신규 의무, 보고 요건, 위반 리스크>"
  },
  "passage_likelihood": {
    "assessment": "<통과 가능성: 높음/중간/낮음>",
    "reasoning": "<판단 근거: 제안자 정치권, 공동발의자 수, 정부 기조, 관련 사회적 이슈>"
  },
  "recommended_actions": [
    "<단기 액션 1 (1-2주 내)>",
    "<중기 액션 2 (1-2개월 내)>",
    "<장기 액션 3 (법 시행 이후)>"
  ]
}

## 작성 원칙
- 구체성 > 추상화. "영향이 있을 수 있다"는 금지.
- 숫자가 있으면 인용. 없으면 "본문 미공개로 추정 불가" 명시.
- 다른 텍스트나 마크다운 블록 없이 순수 JSON만.`;
}
