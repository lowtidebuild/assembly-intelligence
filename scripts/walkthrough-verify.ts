/**
 * Re-capture only the screens that were affected by the walkthrough
 * fixes, so we can diff before/after:
 *   - briefing (should show real Gemini output, bill-linked news first)
 *   - radar slide-over (real summary, real reasoning)
 *   - impact page (real summary, no stub text)
 *
 * Writes to screenshots/after/ so we can compare side-by-side.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium, type Page } from "@playwright/test";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = resolve("screenshots/after");

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
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  try {
    await login(page);

    console.log("── briefing (after) ──");
    await page.goto(`${BASE_URL}/briefing`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: resolve(OUT_DIR, "04-briefing.png"),
      fullPage: true,
    });

    console.log("── bill detail page (after) ──");
    await page.goto(`${BASE_URL}/bills/1`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: resolve(OUT_DIR, "07-bill-detail.png"),
      fullPage: true,
    });

    console.log("── impact page (after) ──");
    await page.goto(`${BASE_URL}/impact?bill=1`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: resolve(OUT_DIR, "09-impact-selected.png"),
      fullPage: true,
    });

    console.log("\n✅ after screenshots saved");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
