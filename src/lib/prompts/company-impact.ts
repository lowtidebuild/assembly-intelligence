/**
 * Company impact prompt — generates a draft "당사 영향 사항"
 * assessment for a single bill. This is the GR/PA team's editable
 * field (design.md section 13).
 *
 * Triggered on-demand when user clicks "AI 초안 생성" in the
 * legislative radar slide-over panel (NOT during morning sync).
 *
 * Uses Gemini Pro for higher quality since this is user-facing copy
 * that the GR/PA expert will then review/edit.
 *
 * Output: 3-5 sentence Korean draft, marked as `companyImpactIsAiDraft=true`.
 */

export interface CompanyImpactInput {
  billName: string;
  committee: string | null;
  proposerName: string;
  proposerParty: string | null;
  proposalReason: string | null;
  mainContent: string | null;
  industryName: string;
  industryContext: string;
  /** Optional company-specific context (e.g. "당사는 PC/모바일 게임 퍼블리셔") */
  companyContext?: string;
}

export function buildCompanyImpactPrompt(input: CompanyImpactInput): string {
  const {
    billName,
    committee,
    proposerName,
    proposerParty,
    proposalReason,
    mainContent,
    industryName,
    industryContext,
    companyContext,
  } = input;

  const body: string[] = [];
  if (proposalReason?.trim()) body.push(`제안이유: ${proposalReason.trim()}`);
  if (mainContent?.trim()) body.push(`주요내용: ${mainContent.trim()}`);
  const bodyBlock =
    body.length > 0
      ? body.join("\n\n")
      : "(본문 미제공 — 의안명과 산업 컨텍스트로 판단)";

  return `당신은 ${industryName} 산업 기업의 GR/PA(대관/정책) 담당자입니다. 이 법안이 당사에 어떻게 영향을 미칠지 내부 보고용 "당사 영향 사항" 초안을 작성합니다.

## 산업 컨텍스트
${industryContext.trim()}

${companyContext ? `## 당사 컨텍스트\n${companyContext.trim()}\n` : ""}
## 법안 정보
- 의안명: ${billName}
- 소관위원회: ${committee ?? "(미정)"}
- 대표발의자: ${proposerName}${proposerParty ? ` (${proposerParty})` : ""}

${bodyBlock}

## 작업
이 법안이 당사에 미칠 실제 영향을 3-5문장으로 작성하세요.

## 작성 원칙
1. **구체적 의무/권리 변경을 짚어라** — "관련 규제가 바뀔 것"이 아니라 "X 조항에 따라 Y 시점까지 Z를 제출해야 함"
2. **영향 축을 명시** — 비용, 매출, 컴플라이언스 리스크, 운영 방식, 고객/파트너 영향 중 어디에 걸리는지
3. **시점 + 규모 힌트** — 즉시 영향인지, 시행령 이후인지, 규모 추정 가능 여부
4. **불확실성은 명시** — "법안 통과 시", "본문 미공개로 추정"처럼 가정을 드러낼 것
5. **이건 초안**이다 — 담당자가 읽고 편집할 전제로 쓸 것. "회사의 방침에 따라" 같은 자리채우기 금지
6. **확신 없는 보호 문장 금지** — "주의가 필요합니다" 같은 붕 뜬 결론 대신 구체 행동이나 구체 리스크로 닫을 것

## 출력
순수 텍스트만 (JSON 없음, 마크다운 없음). 바로 Excel 셀에 붙일 수 있도록.`;
}
