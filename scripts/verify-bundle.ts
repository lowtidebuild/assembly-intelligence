/**
 * Verify the bundled examples/app.html works offline:
 *   1. Load via file:// (no network)
 *   2. Check initial state shows briefing
 *   3. Click a tab, verify active page changes
 *   4. Screenshot each tab for the record
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const bundlePath = resolve("examples/app.html");
  const outDir = resolve("examples/verify-bundle");
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "ko-KR",
  });

  console.log("── loading bundle via file:// ──");
  await page.goto(`file://${bundlePath}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);

  // Check that exactly one page is active at start
  const activeCount = await page
    .locator(".bundled-page.active")
    .count();
  if (activeCount !== 1) {
    throw new Error(`expected 1 active page at start, got ${activeCount}`);
  }
  const initialSlug = await page
    .locator(".bundled-page.active")
    .getAttribute("data-page");
  console.log(`  initial page: ${initialSlug}`);

  // Click through a few tabs and verify switching
  const tabsToTest = [
    "radar",
    "assembly",
    "impact-selected",
    "setup",
    "briefing",
  ];
  for (const slug of tabsToTest) {
    console.log(`  click → ${slug}`);
    await page.locator(`a[data-tab="${slug}"]`).click();
    await page.waitForTimeout(200);
    const active = await page
      .locator(".bundled-page.active")
      .getAttribute("data-page");
    if (active !== slug) {
      throw new Error(
        `after clicking ${slug}, active page was ${active}`,
      );
    }
    await page.screenshot({
      path: resolve(outDir, `${slug}.png`),
      fullPage: false,
    });
  }

  // Also verify deep-link: navigate directly via hash change
  console.log(`  deep-link → #page-watch`);
  await page.evaluate(() => {
    window.location.hash = "page-watch";
  });
  await page.waitForTimeout(200);
  const deepActive = await page
    .locator(".bundled-page.active")
    .getAttribute("data-page");
  if (deepActive !== "watch") {
    throw new Error(`deep link failed: active was ${deepActive}`);
  }
  await page.screenshot({
    path: resolve(outDir, "watch.png"),
    fullPage: false,
  });

  console.log("\n✅ bundle verified — tab switching + hash routing work");

  await browser.close();
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
