import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, isNull } from "drizzle-orm";
import { dailyBriefing } from "../src/db/schema";
import {
  renderDailyBriefingContentHtml,
  type DailyBriefingContent,
} from "../src/lib/daily-briefing-content";

function buildLegacyBriefingContent(date: string): DailyBriefingContent {
  return {
    date,
    title: `${date} | 레거시 브리핑`,
    headlines: [
      {
        text: "레거시 브리핑",
        severity: "info",
      },
    ],
    keyBills: [],
    schedule: [],
    newBills: [],
    watchList: [],
    footerSummary:
      "기존 HTML 브리핑을 안전한 구조화 형식으로 마이그레이션했습니다.",
  };
}

async function main() {
  const { db } = await import("../src/db");
  const rows = await db
    .select({ id: dailyBriefing.id, date: dailyBriefing.date })
    .from(dailyBriefing)
    .where(isNull(dailyBriefing.contentJson));

  console.log(`[backfill-briefing-content-json] candidates=${rows.length}`);

  let migrated = 0;
  for (const row of rows) {
    const contentJson = buildLegacyBriefingContent(row.date);
    const contentHtml = renderDailyBriefingContentHtml(contentJson);
    const updated = await db
      .update(dailyBriefing)
      .set({ contentJson, contentHtml })
      .where(
        and(
          eq(dailyBriefing.id, row.id),
          isNull(dailyBriefing.contentJson),
        ),
      )
      .returning({ id: dailyBriefing.id });

    if (updated.length > 0) {
      migrated += 1;
      console.log(
        `[backfill-briefing-content-json] migrated id=${row.id} date=${row.date}`,
      );
    } else {
      console.log(
        `[backfill-briefing-content-json] skipped id=${row.id} date=${row.date}`,
      );
    }
  }

  console.log(`[backfill-briefing-content-json] migrated=${migrated}`);
}

main().catch((error) => {
  console.error("[backfill-briefing-content-json] failed", error);
  process.exit(1);
});
