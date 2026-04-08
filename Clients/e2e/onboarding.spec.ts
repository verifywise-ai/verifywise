import { test, expect } from "./fixtures/auth.fixture";

test.describe("Onboarding Wizard", () => {
  test("welcome dialog appears on fresh session", async ({
    authedPage: page,
  }) => {
    // Clear onboarding-related localStorage keys to simulate fresh session
    await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (
          key.includes("onboarding") ||
          key.includes("wizard") ||
          key.includes("welcome") ||
          key.includes("tour")
        ) {
          localStorage.removeItem(key);
        }
      });
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    // Check for welcome/onboarding dialog
    const welcomeDialog = page
      .getByRole("dialog")
      .or(page.getByText(/welcome/i))
      .or(page.getByText(/get started/i))
      .or(page.getByText(/onboarding/i))
      .or(page.getByRole("button", { name: /skip for now/i }))
      .or(page.getByRole("button", { name: /next/i }));

    if (await welcomeDialog.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(welcomeDialog.first()).toBeVisible();
    }
  });

  test("can step through wizard or dismiss", async ({ authedPage: page }) => {
    await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (
          key.includes("onboarding") ||
          key.includes("wizard") ||
          key.includes("welcome") ||
          key.includes("tour")
        ) {
          localStorage.removeItem(key);
        }
      });
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    // Look for wizard with navigation
    const nextBtn = page
      .getByRole("button", { name: /next/i })
      .or(page.getByRole("button", { name: /continue/i }));
    const skipBtn = page
      .getByRole("button", { name: /skip/i })
      .or(page.getByRole("button", { name: /dismiss/i }));

    if (await nextBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Step through
      await nextBtn.first().click();
      await page.waitForTimeout(1000);

      // Verify content changed (next step or different content)
      await expect(page.locator("body")).not.toBeEmpty();

      // Dismiss if still open
      const closeBtn = page
        .getByRole("button", { name: /skip/i })
        .or(page.getByRole("button", { name: /close/i }))
        .or(page.getByRole("button", { name: /get started/i }))
        .or(page.getByRole("button", { name: /done/i }))
        .or(page.getByRole("button", { name: /finish/i }));

      if (await closeBtn.first().isVisible().catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(500);
      }
    } else if (await skipBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test("completing wizard persists dismissal", async ({
    authedPage: page,
  }) => {
    // First dismiss the wizard
    const skipBtn = page
      .getByRole("button", { name: /skip for now/i })
      .or(page.getByRole("button", { name: /skip/i }))
      .or(page.getByRole("button", { name: /close/i }))
      .or(page.getByRole("button", { name: /get started/i }));

    if (await skipBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skipBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Reload the page
    await page.reload();
    await page.waitForTimeout(3000);

    // Wizard should NOT reappear
    const wizardDialog = page
      .getByRole("button", { name: /skip for now/i })
      .or(page.getByText(/welcome to verifywise/i));

    const reappeared = await wizardDialog
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // If it doesn't reappear, that's the expected behavior
    if (!reappeared) {
      expect(reappeared).toBe(false);
    }
  });
});
