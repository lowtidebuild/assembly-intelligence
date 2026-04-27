import { describe, expect, it } from "vitest";
import {
  buildFallbackDailyBriefingContent,
  dailyBriefingContentSchema,
  renderDailyBriefingContentHtml,
} from "@/lib/daily-briefing-content";

describe("daily briefing content", () => {
  it("builds valid fallback JSON and deterministic HTML", () => {
    const content = buildFallbackDailyBriefingContent({
      date: "2026-04-27",
      industryName: "게임",
      keyBills: [
        {
          id: 1,
          billName: "게임산업진흥에 관한 법률 일부개정법률안",
          proposerName: "홍길동",
          proposerParty: "무소속",
          committee: "문화체육관광위원회",
          summaryText: "게임 이용자 보호를 강화하려는 법안입니다.",
          relevanceReasoning: "게임산업에 직접 영향을 줍니다.",
        },
      ],
      scheduleItems: [],
      newBills: [],
    });

    expect(dailyBriefingContentSchema.parse(content)).toMatchObject({
      date: "2026-04-27",
      title: "2026년 4월 27일 | 게임 인텔리전스",
    });
    expect(renderDailyBriefingContentHtml(content)).toContain(
      "게임산업진흥에 관한 법률 일부개정법률안",
    );
  });

  it("escapes generated HTML fields", () => {
    const content = dailyBriefingContentSchema.parse({
      date: "2026-04-27",
      title: "브리핑",
      headlines: [
        {
          text: "<script>alert(1)</script>",
          severity: "info",
        },
      ],
      keyBills: [],
      schedule: [],
      newBills: [],
      watchList: [],
      footerSummary: "마무리",
    });

    const html = renderDailyBriefingContentHtml(content);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
