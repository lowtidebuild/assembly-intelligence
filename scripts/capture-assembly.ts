/**
 * Re-capture just the assembly hemicycle page to verify the
 * wedge layout fix. Saves to screenshots/after/10-assembly.png.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function login(page: Page) {
  await page.goto("http://localhost:3000/login");
  await page.fill('input[name="password"]', process.env.APP_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/briefing/);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  try {
    await login(page);
    await page.goto("http://localhost:3000/assembly");
    await page.waitForSelector("svg circle");
    await page.screenshot({
      path: resolve("screenshots/after/10-assembly.png"),
      fullPage: true,
    });
    console.log("✅ captured");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
