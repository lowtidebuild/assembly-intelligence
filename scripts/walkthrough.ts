/**
 * End-to-end visual walkthrough.
 *
 * Launches headless Chromium, logs in, visits every page, and saves
 * full-page screenshots to screenshots/. Each screenshot is captioned
 * in a JSON sidecar so we can annotate UX findings after review.
 *
 * Usage:
 *   1. pnpm start   (in another terminal, or run this after `pnpm start` in bg)
 *   2. pnpm tsx scripts/walkthrough.ts
 *
 * The script is intentionally linear — no retries, no cleverness.
 * Fails fast on the first error so we can fix + rerun.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = resolve("screenshots");
const VIEWPORT = { width: 1440, height: 900 };

interface Snapshot {
  name: string;
  url: string;
  description: string;
  /** Actions performed on the page before snapshot (for debugging) */
  actions?: string[];
}

const snapshots: Snapshot[] = [];

async function snap(
  page: Page,
  name: string,
  description: string,
  actions: string[] = [],
) {
  const filePath = resolve(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  snapshots.push({
    name,
    url: page.url(),
    description,
    actions,
  });
  console.log(`  📸 ${name}.png — ${description}`);
}

async function main() {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    throw new Error("APP_PASSWORD not set — needed to log in");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  try {
    console.log("── 1. unauth redirect ──");
    await page.goto(`${BASE_URL}/briefing`);
    await page.waitForURL(/\/login/);
    await snap(
      page,
      "01-unauth-redirect",
      "Unauthenticated /briefing bounces to /login with return_to param",
    );

    console.log("\n── 2. login page ──");
    await snap(page, "02-login-page", "Login page with ParlaWatch+ branding");

    console.log("\n── 3. bad password error ──");
    await page.fill('input[name="password"]', "wrong-password");
    await page.click('button[type="submit"]');
    await page.waitForURL(/error=bad_password/);
    await snap(
      page,
      "03-login-error",
      "Login page showing bad_password error",
      ["fill wrong password", "submit"],
    );

    console.log("\n── 4. successful login ──");
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/briefing/);
    await snap(
      page,
      "04-briefing",
      "Briefing page — top bills, Gemini summary, news rail",
    );

    console.log("\n── 5. radar page ──");
    await page.click('a[href="/radar"]');
    await page.waitForURL(/\/radar/);
    await page.waitForSelector("table");
    await snap(
      page,
      "05-radar-default",
      "Radar page default view — all bills, sorted by date desc",
    );

    console.log("\n── 6. radar filter (stage + score) ──");
    await page.click('a[href="/radar?stage=stage_2"]').catch(async () => {
      // chip has params encoded, grab via text
      await page.locator("text=상임위").first().click();
    });
    await page.waitForLoadState("networkidle");
    await snap(
      page,
      "06-radar-filtered",
      "Radar page filtered to stage_2 (상임위 심사)",
    );

    console.log("\n── 7. radar slide-over opened ──");
    // Click the first bill name in the table
    await page.goto(`${BASE_URL}/radar?bill=1`);
    await page.waitForLoadState("networkidle");
    await snap(
      page,
      "07-radar-slide-over",
      "Bill slide-over panel with AI summary + relevance reasoning + company impact editor",
    );

    console.log("\n── 8. impact page empty picker ──");
    await page.goto(`${BASE_URL}/impact`);
    await page.waitForLoadState("networkidle");
    await snap(
      page,
      "08-impact-empty",
      "Impact page with no bill selected — left sidebar picker, empty center",
    );

    console.log("\n── 9. impact page with bill selected ──");
    await page.goto(`${BASE_URL}/impact?bill=1`);
    await page.waitForLoadState("networkidle");
    await snap(
      page,
      "09-impact-selected",
      "Impact page showing bill detail + company impact editor + deep analysis panel",
    );

    console.log("\n── 10. assembly page (hemicycle) ──");
    await page.goto(`${BASE_URL}/assembly`);
    await page.waitForLoadState("networkidle");
    // Wait for SVG to render
    await page.waitForSelector("svg circle");
    await snap(
      page,
      "10-assembly",
      "Assembly page — full 295-member hemicycle + party stats",
    );

    console.log("\n── 11. watch page ──");
    await page.goto(`${BASE_URL}/watch`);
    await page.waitForLoadState("networkidle");
    await snap(
      page,
      "11-watch",
      "Watch page — watch list (likely empty) + hemicycle picker",
    );

    console.log("\n── 12. settings page ──");
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState("networkidle");
    await snap(
      page,
      "12-settings",
      "Settings page — profile card, env status, recent syncs",
    );

    console.log("\n── 13. setup wizard (edit mode, step 2) ──");
    await page.goto(`${BASE_URL}/setup`);
    await page.waitForLoadState("networkidle");
    await snap(
      page,
      "13-setup-step2",
      "Setup wizard step 2 (keywords) in edit mode with game profile",
    );

    console.log("\n── 14. setup wizard step 3 (committees) ──");
    // Click 다음 button
    await page.locator("button:has-text('다음')").click();
    await page.waitForTimeout(500);
    await snap(
      page,
      "14-setup-step3-committees",
      "Setup wizard step 3 — committee checkbox list",
    );

    console.log("\n── 15. setup wizard step 4 (legislators) ──");
    await page.locator("button:has-text('다음')").click();
    await page.waitForTimeout(800);
    await snap(
      page,
      "15-setup-step4-legislators",
      "Setup wizard step 4 — hemicycle legislator picker",
    );

    console.log("\n── 16. setup wizard step 5 (confirm) ──");
    await page.locator("button:has-text('다음')").click();
    await page.waitForTimeout(500);
    await snap(
      page,
      "16-setup-step5-confirm",
      "Setup wizard step 5 — summary + submit button",
    );

    console.log("\n── 17. logout ──");
    // Go somewhere with the sidebar visible
    await page.goto(`${BASE_URL}/briefing`);
    await page.waitForLoadState("networkidle");
    // The sidebar logout is a POST form — click the button
    const logoutButton = page.locator("button:has-text('로그아웃')");
    if (await logoutButton.count()) {
      await logoutButton.click();
      await page.waitForURL(/\/login/);
      await snap(page, "17-logged-out", "After logout — back on login page");
    }

    // Write manifest
    const manifest = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      viewport: VIEWPORT,
      snapshots,
    };
    writeFileSync(
      resolve(OUT_DIR, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
    console.log(`\n✅ ${snapshots.length} screenshots + manifest.json saved`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n❌ walkthrough failed:", err);
  process.exit(1);
});
