/**
 * Load each exported examples/*.html via file:// and screenshot it.
 * Purpose: verify the offline rendering actually matches the live
 * server output (CSS inlined correctly, no broken layout).
 *
 * Saves screenshots to examples/verify/<name>.png for visual diff
 * against screenshots/<n>-*.png.
 */

import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const examplesDir = resolve("examples");
  const verifyDir = resolve("examples/verify");
  mkdirSync(verifyDir, { recursive: true });

  const htmlFiles = readdirSync(examplesDir)
    .filter((f) => f.endsWith(".html") && f !== "index.html");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
    // Block network so we're sure the HTML is self-contained
    // (allows file:// but not http://)
  });
  const page = await context.newPage();

  for (const filename of htmlFiles) {
    const url = `file://${resolve(examplesDir, filename)}`;
    const name = filename.replace(/\.html$/, "");
    console.log(`── ${name} ──`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500); // let any fonts settle
      const screenshotPath = resolve(verifyDir, `${name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  → ${screenshotPath.split("/").slice(-2).join("/")}`);
    } catch (err) {
      console.error(`  ❌ ${err}`);
    }
  }

  await browser.close();
  console.log(`\n✅ verified ${htmlFiles.length} pages`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
