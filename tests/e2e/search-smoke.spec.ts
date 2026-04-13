import { test, expect } from "@playwright/test";

test.describe("dashboard smoke", () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "PLAYWRIGHT_BASE_URL is required");

  test("briefing page exposes the unified search input", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/briefing`);
    await expect(
      page.getByPlaceholder("법안, 의원, 키워드 검색..."),
    ).toBeVisible();
  });
});
