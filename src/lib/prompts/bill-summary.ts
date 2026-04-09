/**
 * Bill summary prompt — generates a 2-3 sentence plain-language
 * summary of a single bill, pre-rendered during morning sync so the
 * slide-over panel in 입법 레이더 opens instantly.
 *
 * Uses Gemini Flash. Output is a single Korean string (no JSON wrapper).
 */

export interface BillSummaryInput {
  billName: string;
  committee: string | null;
  proposerName: string;
  proposalReason: string | null;
  mainContent: string | null;
}

export function buildBillSummaryPrompt(input: BillSummaryInput): string {
  const { billName, committee, proposerName, proposalReason, mainContent } =
    input;

  const body: string[] = [];
  if (proposalReason?.trim()) body.push(`제안이유: ${proposalReason.trim()}`);
  if (mainContent?.trim()) body.push(`주요내용: ${mainContent.trim()}`);
  const bodyBlock =
    body.length > 0
      ? body.join("\n\n")
      : "(본문 미제공 — 의안명으로 추정할 것)";

  return `다음 법안을 2-3문장으로 요약하세요. 법률 용어를 풀어 쓰고, 무엇을 바꾸려는지 명확하게.

- 의안명: ${billName}
- 소관위원회: ${committee ?? "(미정)"}
- 대표발의자: ${proposerName}

${bodyBlock}

## 출력 규칙
- 순수 텍스트만 (JSON 없음, 마크다운 없음)
- 2-3문장
- 첫 문장: 이 법안이 무엇을 바꾸려는가
- 두 번째 문장: 왜 (배경/목적)
- 세 번째 문장 (선택): 핵심 영향 대상
- "이 법안은" 같은 군더더기 제거, 본론부터 시작`;
}
