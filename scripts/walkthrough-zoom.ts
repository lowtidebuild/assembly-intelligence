/**
 * Element-level walkthrough — captures specific elements (sidebar,
 * topbar, card grid, slide-over, etc) at natural size so the Read
 * tool doesn't have to downscale the whole viewport.
 *
 * Complements scripts/walkthrough.ts which captures full pages.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium, type Locator, type Page } from "@playwright/test";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = resolve("screenshots/zoom");

async function shoot(loc: Locator, name: string, description: string) {
  const path = resolve(OUT_DIR, `${name}.png`);
  await loc.screenshot({ path });
  console.log(`  📸 ${name}.png — ${description}`);
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="password"]', process.env.APP_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/briefing/);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    deviceScaleFactor: 2, // retina-quality captures
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  try {
    await login(page);

    // ── Briefing page details ──
    console.log("\n── briefing zoom ──");
    await page.goto(`${BASE_URL}/briefing`);
    await page.waitForLoadState("networkidle");

    await shoot(page.locator("aside").first(), "b01-sidebar", "Sidebar with nav + sync footer");
    await shoot(
      page.locator("header, .sticky").first(),
      "b02-topbar",
      "Top bar with title + search + refresh",
    );
    await shoot(
      page.locator("section").filter({ hasText: "오늘의 핵심" }).first(),
      "b03-key-bills",
      "Top-4 key bills section",
    );
    await shoot(
      page.locator("section").filter({ hasText: "신규 발의" }).first(),
      "b04-new-bills",
      "New bills list",
    );
    // Right rail: Gemini briefing
    const geminiCard = page
      .locator("div")
      .filter({ hasText: /Gemini 브리핑/ })
      .first();
    await shoot(geminiCard, "b05-gemini-briefing", "Gemini briefing side panel");
    // Right rail: Naver news
    const newsCard = page
      .locator("div")
      .filter({ hasText: /관련 뉴스/ })
      .first();
    await shoot(newsCard, "b06-news", "Naver News side panel");

    // ── Radar page ──
    console.log("\n── radar zoom ──");
    await page.goto(`${BASE_URL}/radar`);
    await page.waitForSelector("table");

    // Full filter bar
    await shoot(
      page.locator("form").first(),
      "r01-filter-bar",
      "Search form + chip filters",
    );
    // Table region
    await shoot(page.locator("table"), "r02-table", "Bills table with sort headers");

    // Canonical bill detail page
    await page.goto(`${BASE_URL}/bills/1`);
    await page.waitForLoadState("networkidle");
    await shoot(
      page.locator("main").first(),
      "r03-bill-detail",
      "Bill detail page with evidence and actions",
    );

    // ── Impact page ──
    console.log("\n── impact zoom ──");
    await page.goto(`${BASE_URL}/impact?bill=1`);
    await page.waitForLoadState("networkidle");
    await shoot(
      page.locator("aside").filter({ hasText: "분석 대상 선택" }),
      "i01-bill-picker",
      "Impact page bill picker sidebar",
    );
    // Main analysis card
    const analysisCard = page.locator(".space-y-5").first();
    await shoot(analysisCard, "i02-analysis-shell", "Impact page analysis shell");

    // ── Assembly hemicycle ──
    console.log("\n── assembly zoom ──");
    await page.goto(`${BASE_URL}/assembly`);
    await page.waitForSelector("svg circle");
    await shoot(
      page.locator("svg").first(),
      "a01-hemicycle",
      "Hemicycle SVG",
    );
    await shoot(
      page.locator("aside").first(),
      "a02-party-stats",
      "Party stats sidebar",
    );

    // ── Watch page ──
    console.log("\n── watch zoom ──");
    await page.goto(`${BASE_URL}/watch`);
    await page.waitForLoadState("networkidle");
    await shoot(
      page.locator("section").first(),
      "w01-watch-list",
      "Watch list (empty state)",
    );
    // Hemicycle picker sidebar
    const pickerAside = page.locator("aside").filter({ hasText: "의원 선택" });
    if (await pickerAside.count()) {
      await shoot(pickerAside.first(), "w02-picker", "Watch page hemicycle picker");
    }

    // ── Settings ──
    console.log("\n── settings zoom ──");
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState("networkidle");
    const cards = await page.locator(".rounded-\\[var\\(--radius\\)\\]").all();
    // Shoot first 4 cards
    for (let i = 0; i < Math.min(4, cards.length); i++) {
      await shoot(cards[i], `s0${i + 1}-card`, `Settings card ${i + 1}`);
    }

    // ── Setup wizard ──
    console.log("\n── setup zoom ──");
    await page.goto(`${BASE_URL}/setup`);
    await page.waitForLoadState("networkidle");
    // Step 2 form
    await shoot(page.locator("main"), "u01-step2-form", "Step 2 form");

    // Navigate to step 3
    await page.locator("button:has-text('다음')").click();
    await page.waitForTimeout(300);
    await shoot(page.locator("main"), "u02-step3-committees", "Step 3 committee grid");

    // Step 4
    await page.locator("button:has-text('다음')").click();
    await page.waitForTimeout(500);
    await shoot(page.locator("main"), "u03-step4-legislators", "Step 4 legislator picker");

    // Step 5
    await page.locator("button:has-text('다음')").click();
    await page.waitForTimeout(300);
    await shoot(page.locator("main"), "u04-step5-confirm", "Step 5 confirm summary");

    console.log("\n✅ element captures saved");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
