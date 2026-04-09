/**
 * Daily briefing prompt — generates the full HTML content for the
 * 브리핑봇 page. Uses Gemini Pro (not Flash) because this output is
 * the user-facing morning read and quality matters.
 *
 * Input: top relevance-scored bills, upcoming schedule, new bills.
 * Output: structured HTML with sections:
 *   1. 헤드라인 (top 3 핵심 사안)
 *   2. 핵심 법안 (상세 + 영향)
 *   3. 오늘의 일정
 *   4. 신규 발의 법안
 *   5. Watch List (추가 모니터링)
 *
 * The UI wraps this in a card container with ParlaWatch styling.
 * The HTML should use semantic tags + Tailwind-friendly class names.
 */

import type { Bill } from "@/db/schema";
import type { ScheduleItem } from "@/services/sync";

export interface DailyBriefingInput {
  date: string; // "2026-04-10"
  industryName: string;
  keyBills: Bill[]; // relevanceScore >= 4
  scheduleItems: ScheduleItem[];
  newBills: Bill[]; // created in last 24h
}

export function buildDailyBriefingPrompt(input: DailyBriefingInput): string {
  const { date, industryName, keyBills, scheduleItems, newBills } = input;

  const keyBillsBlock =
    keyBills.length === 0
      ? "(오늘 핵심으로 올릴 법안 없음)"
      : keyBills
          .map((b, i) => {
            const parts = [
              `${i + 1}. [${b.stage}] ${b.billName}`,
              `   제안자: ${b.proposerName}${b.proposerParty ? ` (${b.proposerParty})` : ""}`,
              `   소관위: ${b.committee ?? "미정"}`,
              `   중요도: ${b.relevanceScore}/5`,
              b.relevanceReasoning ? `   판단: ${b.relevanceReasoning}` : null,
              b.summaryText ? `   요약: ${b.summaryText}` : null,
            ].filter(Boolean);
            return parts.join("\n");
          })
          .join("\n\n");

  const scheduleBlock =
    scheduleItems.length === 0
      ? "(이번주 등록된 일정 없음)"
      : scheduleItems
          .slice(0, 20)
          .map(
            (s) =>
              `- ${s.date} ${s.time} — ${s.subject}${s.committee ? ` [${s.committee}]` : ""}${s.location ? ` @ ${s.location}` : ""}`,
          )
          .join("\n");

  const newBillsBlock =
    newBills.length === 0
      ? "(지난 24시간 신규 발의 없음)"
      : newBills
          .slice(0, 10)
          .map(
            (b, i) =>
              `${i + 1}. ${b.billName} — ${b.proposerName}${b.proposerParty ? ` (${b.proposerParty})` : ""}`,
          )
          .join("\n");

  return `당신은 한국 국회 입법 활동을 모니터링하는 ${industryName} 산업의 GR/PA 전문 분석가입니다. 매일 아침 이 산업 담당자에게 읽히는 일일 브리핑을 작성합니다.

## 브리핑 날짜
${date}

## 오늘의 핵심 법안 (중요도 4점 이상)
${keyBillsBlock}

## 예정 일정
${scheduleBlock}

## 지난 24시간 신규 발의
${newBillsBlock}

## 작업
위 데이터를 바탕으로 ${industryName} 담당자용 일일 브리핑 HTML을 작성하세요.

## 출력 형식 (반드시 HTML만, 다른 설명 없이)
\`\`\`html
<article class="briefing">
  <header class="briefing-header">
    <p class="briefing-date">2026년 4월 10일 | ${industryName} 인텔리전스</p>
    <h1 class="briefing-title">오늘의 헤드라인</h1>
  </header>

  <section class="briefing-headlines">
    <!-- 최상단 3줄: 오늘 가장 중요한 사안 3가지를 한 문장씩. Bullet. -->
  </section>

  <section class="briefing-key-bills">
    <h2>핵심 법안</h2>
    <!-- 각 핵심 법안을 카드 형태로. 법안명, 제안자+정당, 왜 중요한지 한 단락. -->
  </section>

  <section class="briefing-schedule">
    <h2>오늘/이번주 일정</h2>
    <!-- 일정을 한눈에. 리스트 형태. -->
  </section>

  <section class="briefing-new-bills">
    <h2>신규 발의</h2>
    <!-- 지난 24시간 새로 들어온 법안들. 간단한 리스트. -->
  </section>

  <footer class="briefing-footer">
    <p class="briefing-summary">
      <!-- 한 문장 마무리: 오늘의 톤을 요약. "주의" "관찰" "조용한 날" 등 명확하게. -->
    </p>
  </footer>
</article>
\`\`\`

## 작성 원칙
- 톤: 간결, 전문가용, 법률 용어는 풀어 쓰되 정확하게
- 문장: 짧게. 3줄 이상 이어지는 설명은 금지
- 구체성: "~할 가능성이 있다"보다는 "X 조항은 Y를 Z시간 내 보고 의무화"
- 무근거 예측 금지: 데이터에 없는 내용을 만들어내지 말 것
- 빈 섹션이면 해당 섹션에 "(오늘은 해당 없음)"이라 명시
- 감정 어휘, 이모지, 확신 없는 표현("~같다", "~일 수도") 최소화`;
}
