import { expect, test } from "@playwright/test";

test.describe("setup wizard law mixins", () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "PLAYWRIGHT_BASE_URL is required");

  test("shows mixin choices after picking a preset and advances to step 2", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/setup`);

    await page.getByRole("button", { name: /게임/ }).first().click();
    await expect(page.getByText("관련 법률 (선택)")).toBeVisible();

    const ecommerceCheckbox = page.getByLabel(/전자상거래법/);
    await ecommerceCheckbox.check();
    await expect(ecommerceCheckbox).toBeChecked();
    await expect(page.getByText(/법률 1개 추가/)).toBeVisible();

    await page.getByRole("button", { name: /다음/ }).click();
    await expect(page.getByText("산업 정보를 확인하세요")).toBeVisible();
  });

  test("toggling a mixin on then off clears the preview count", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/setup`);

    await page.getByRole("button", { name: /게임/ }).first().click();
    await expect(page.getByText("관련 법률 (선택)")).toBeVisible();

    const ecommerceCheckbox = page.getByLabel(/전자상거래법/);
    await ecommerceCheckbox.check();
    await expect(page.getByText(/법률 1개 추가/)).toBeVisible();

    await ecommerceCheckbox.uncheck();
    await expect(ecommerceCheckbox).not.toBeChecked();
    await expect(page.getByText(/법률 \d+개 추가/)).toHaveCount(0);
  });

  test("proceeds without selecting any mixin (empty selectedLawMixins path)", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/setup`);

    await page.getByRole("button", { name: /게임/ }).first().click();
    await expect(page.getByText("관련 법률 (선택)")).toBeVisible();

    // No mixin checked — preview should only show base keywords, no "법률 N개 추가"
    await expect(page.getByText(/법률 \d+개 추가/)).toHaveCount(0);

    await page.getByRole("button", { name: /다음/ }).click();
    await expect(page.getByText("산업 정보를 확인하세요")).toBeVisible();
  });

  test(
    "edit mode pre-checks saved mixins (full round trip)",
    async ({ page, baseURL }) => {
      // Round-trip persistence check: create profile with ecommerce-act selected,
      // submit, then revisit /setup in edit mode and verify the checkbox state.
      // This covers ExistingProfileDTO -> wizard state hydration (src/app/setup/page.tsx).
      test.skip(
        !process.env.PLAYWRIGHT_ALLOW_WRITES,
        "PLAYWRIGHT_ALLOW_WRITES is required — this test writes to the target DB",
      );

      await page.goto(`${baseURL}/setup`);

      await page.getByRole("button", { name: /게임/ }).first().click();
      await page.getByLabel(/전자상거래법/).check();
      await page.getByRole("button", { name: /다음/ }).click(); // step 2

      // Walk to step 5 (confirm). Step 2 is pre-filled by preset; just click 다음.
      await page.getByRole("button", { name: /다음/ }).click(); // → 3
      await page.getByRole("button", { name: /다음/ }).click(); // → 4
      await page.getByRole("button", { name: /다음/ }).click(); // → 5

      await expect(page.getByText("관련 법률 (1)")).toBeVisible();

      // Submit. Wizard routes to /briefing on success.
      await page.getByRole("button", { name: /저장|완료|확인/ }).last().click();
      await page.waitForURL(/\/briefing/, { timeout: 15_000 });

      // Revisit /setup — must land on step 1 (preset-backed), mixin pre-checked.
      await page.goto(`${baseURL}/setup`);
      const ecommerceCheckbox = page.getByLabel(/전자상거래법/);
      await expect(ecommerceCheckbox).toBeChecked();
    },
  );
});
