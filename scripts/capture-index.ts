import { chromium } from "@playwright/test";
import { resolve } from "node:path";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`file://${resolve("examples/index.html")}`);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve("examples/verify/index.png"),
    fullPage: true,
  });
  await browser.close();
  console.log("✅ index captured");
}

main();
