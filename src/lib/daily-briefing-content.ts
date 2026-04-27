import { z } from "zod";

export const dailyBriefingContentSchema = z.object({
  date: z.string().min(1),
  title: z.string().min(1),
  headlines: z
    .array(
      z.object({
        text: z.string().min(1),
        severity: z.enum(["watch", "action", "info"]),
        billId: z.number().int().optional(),
      }),
    )
    .default([]),
  keyBills: z
    .array(
      z.object({
        billId: z.number().int(),
        title: z.string().min(1),
        whyItMatters: z.string().min(1),
        recommendedAction: z.string().min(1),
      }),
    )
    .default([]),
  schedule: z
    .array(
      z.object({
        date: z.string().min(1),
        time: z.string().nullable().optional(),
        subject: z.string().min(1),
        committee: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
      }),
    )
    .default([]),
  newBills: z
    .array(
      z.object({
        billId: z.number().int(),
        title: z.string().min(1),
        proposer: z.string().min(1),
        committee: z.string().nullable().optional(),
      }),
    )
    .default([]),
  watchList: z.array(z.string()).default([]),
  footerSummary: z.string().min(1),
});

export type DailyBriefingContent = z.infer<typeof dailyBriefingContentSchema>;

interface BriefingBillLike {
  id: number;
  billName: string;
  proposerName: string;
  proposerParty: string | null;
  committee: string | null;
  summaryText: string | null;
  relevanceReasoning: string | null;
}

interface BriefingScheduleLike {
  date: string;
  time: string | null;
  subject: string;
  committee: string | null;
  location: string | null;
}

export function buildFallbackDailyBriefingContent(input: {
  date: string;
  industryName: string;
  keyBills: BriefingBillLike[];
  scheduleItems: BriefingScheduleLike[];
  newBills: BriefingBillLike[];
}): DailyBriefingContent {
  const headlines =
    input.keyBills.length > 0
      ? input.keyBills.slice(0, 3).map((bill) => ({
          text:
            bill.summaryText ??
            `${bill.billName}은 ${input.industryName} 산업 관련 핵심 모니터링 대상입니다.`,
          severity: "watch" as const,
          billId: bill.id,
        }))
      : [
          {
            text: "오늘은 즉시 대응이 필요한 핵심 법안이 없습니다.",
            severity: "info" as const,
          },
        ];

  return {
    date: input.date,
    title: `${formatKoreanDate(input.date)} | ${input.industryName} 인텔리전스`,
    headlines,
    keyBills: input.keyBills.slice(0, 4).map((bill) => ({
      billId: bill.id,
      title: bill.billName,
      whyItMatters:
        bill.relevanceReasoning ??
        bill.summaryText ??
        "중요도 점수가 높은 법안으로 후속 모니터링이 필요합니다.",
      recommendedAction: "본문, 소관위 심사 일정, 관련 이해관계자 반응을 확인하세요.",
    })),
    schedule: input.scheduleItems.slice(0, 10).map((item) => ({
      date: item.date,
      time: item.time,
      subject: item.subject,
      committee: item.committee,
      location: item.location,
    })),
    newBills: input.newBills.slice(0, 10).map((bill) => ({
      billId: bill.id,
      title: bill.billName,
      proposer: bill.proposerParty
        ? `${bill.proposerName} (${bill.proposerParty})`
        : bill.proposerName,
      committee: bill.committee,
    })),
    watchList:
      input.keyBills.length > 0
        ? input.keyBills
            .slice(0, 3)
            .map((bill) => `${bill.billName}: 심사 일정과 본문 변경 여부 확인`)
        : ["신규 핵심 법안 발생 여부를 다음 동기화에서 확인"],
    footerSummary:
      input.keyBills.length > 0
        ? "핵심 법안 중심으로 본문과 심사 일정을 확인해야 하는 날입니다."
        : "큰 변동은 없지만 신규 발의와 입법예고는 계속 관찰합니다.",
  };
}

export function renderDailyBriefingContentHtml(
  content: DailyBriefingContent,
): string {
  const headlines = content.headlines.length
    ? content.headlines
        .map(
          (item) =>
            `<li data-severity="${escapeHtml(item.severity)}">${escapeHtml(item.text)}</li>`,
        )
        .join("")
    : "<li>오늘은 해당 없음</li>";
  const keyBills = content.keyBills.length
    ? content.keyBills
        .map(
          (item) => `
            <article class="briefing-bill" data-bill-id="${item.billId}">
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.whyItMatters)}</p>
              <p><strong>권장 액션:</strong> ${escapeHtml(item.recommendedAction)}</p>
            </article>
          `,
        )
        .join("")
    : "<p>(오늘은 해당 없음)</p>";
  const schedule = content.schedule.length
    ? content.schedule
        .map(
          (item) =>
            `<li>${escapeHtml(item.date)} ${escapeHtml(item.time ?? "")} — ${escapeHtml(item.subject)}${item.committee ? ` [${escapeHtml(item.committee)}]` : ""}${item.location ? ` @ ${escapeHtml(item.location)}` : ""}</li>`,
        )
        .join("")
    : "<li>(오늘은 해당 없음)</li>";
  const newBills = content.newBills.length
    ? content.newBills
        .map(
          (item) =>
            `<li data-bill-id="${item.billId}">${escapeHtml(item.title)} — ${escapeHtml(item.proposer)}${item.committee ? ` [${escapeHtml(item.committee)}]` : ""}</li>`,
        )
        .join("")
    : "<li>(오늘은 해당 없음)</li>";
  const watchList = content.watchList.length
    ? content.watchList.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>(오늘은 해당 없음)</li>";

  return `
<article class="briefing">
  <header class="briefing-header">
    <p class="briefing-date">${escapeHtml(content.title)}</p>
    <h1 class="briefing-title">오늘의 헤드라인</h1>
  </header>
  <section class="briefing-headlines"><ul>${headlines}</ul></section>
  <section class="briefing-key-bills"><h2>핵심 법안</h2>${keyBills}</section>
  <section class="briefing-schedule"><h2>오늘/이번주 일정</h2><ul>${schedule}</ul></section>
  <section class="briefing-new-bills"><h2>신규 발의</h2><ul>${newBills}</ul></section>
  <section class="briefing-watch-list"><h2>Watch List</h2><ul>${watchList}</ul></section>
  <footer class="briefing-footer"><p class="briefing-summary">${escapeHtml(content.footerSummary)}</p></footer>
</article>`.trim();
}

function formatKoreanDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
