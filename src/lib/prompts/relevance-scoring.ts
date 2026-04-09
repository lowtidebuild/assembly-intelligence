/**
 * Relevance scoring prompt — assigns a 1-5 score to a single bill
 * based on how directly it affects the user's industry.
 *
 * Runs per-bill during morning sync. Uses Gemini Flash (cheap + fast).
 *
 * ⚠️ MCP does NOT expose 제안이유/주요내용. The prompt must work with
 * just title + committee + proposer + party. See docs/mcp-api-reality.md.
 *
 * Score rubric (must stay stable — used for UI S/A/B/C mapping):
 *   5 = 당사 직접 영향, 핵심 비즈니스 규제 변경 (S)
 *   4 = 업계 전반 주요 영향, 매출/비용 가능성 있음 (A)
 *   3 = 관련 산업 간접 영향, 모니터링 필요 (B)
 *   2 = 인접 영역, 가능성은 있지만 영향 미미 (B-)
 *   1 = 거의 무관, 제목만 겹침 (C)
 *
 * Output format (strict JSON matching the zod schema in gemini-client.ts):
 * { "score": 1|2|3|4|5, "reasoning": "<2-3 sentences in Korean>" }
 */

export interface RelevanceScoringInput {
  billName: string;
  committee: string | null;
  proposerName: string;
  proposerParty: string | null;
  proposalReason: string | null; // often null (MCP limitation)
  mainContent: string | null; // often null
  industryName: string;
  industryContext: string;
  industryKeywords: string[];
}

export function buildRelevanceScoringPrompt(
  input: RelevanceScoringInput,
): string {
  const {
    billName,
    committee,
    proposerName,
    proposerParty,
    proposalReason,
    mainContent,
    industryName,
    industryContext,
    industryKeywords,
  } = input;

  // Only include body sections if we actually have content — otherwise
  // the prompt is cleaner without "제안이유: null".
  const bodySections: string[] = [];
  if (proposalReason?.trim()) {
    bodySections.push(`제안이유:\n${proposalReason.trim()}`);
  }
  if (mainContent?.trim()) {
    bodySections.push(`주요내용:\n${mainContent.trim()}`);
  }
  const bodyBlock =
    bodySections.length > 0
      ? bodySections.join("\n\n")
      : "(본문 미제공 — 의안명/소관위원회/제안자 정보만으로 판단할 것)";

  return `당신은 한국 국회 입법 활동을 추적하는 ${industryName} 산업의 GR/PA(대관/정책) 전문 분석가입니다.

## 산업 컨텍스트
${industryContext.trim()}

## 주요 키워드
${industryKeywords.join(", ")}

## 분석할 법안
- 의안명: ${billName}
- 소관위원회: ${committee ?? "(미정)"}
- 대표발의자: ${proposerName}${proposerParty ? ` (${proposerParty})` : ""}

${bodyBlock}

## 작업
이 법안이 ${industryName} 산업에 얼마나 직접적으로 영향을 미치는지 1~5점으로 평가하세요.

## 점수 기준
- **5점** = 당사/산업에 **직접 영향**. 핵심 비즈니스 규제 변경, 신규 의무 부과, 주요 비용 구조 영향. 당장 대응 필요.
- **4점** = 업계 전반에 **주요 영향**. 매출/비용 변동 가능성, 경쟁 환경 변화. 사내 공유 + 모니터링 강화 필요.
- **3점** = **간접 영향**. 관련 산업/파트너 영향으로 우리에게도 파급 가능. 추이 모니터링.
- **2점** = **인접 영역**. 영향 가능성은 있으나 미미. 로그만 남기고 지나감.
- **1점** = **거의 무관**. 키워드 겹침만 있고 실질 관련성 없음.

## 출력 형식
반드시 JSON으로만 답하세요. 다른 설명 없이.

{
  "score": <1|2|3|4|5>,
  "reasoning": "<점수 이유 한국어 2-3문장. 어떤 조항이 왜 해당 점수인지 구체적으로>"
}`;
}
