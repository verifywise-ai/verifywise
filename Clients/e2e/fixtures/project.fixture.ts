import { test as base, expect, type Page } from "@playwright/test";

/**
 * Extended test fixture that provides an authenticated page with a project
 * already created. Many entities (vendors, risks, datasets) require a
 * project to exist before they can be created.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/project.fixture";
 *   test("my test", async ({ projectPage, projectName }) => { ... });
 */
export const test = base.extend<{
  projectPage: Page;
  projectName: string;
}>({
  projectName: async ({}, use) => {
    await use(`E2E-Project-${Date.now()}`);
  },

  projectPage: async ({ page, projectName }, use) => {
    // storageState is already loaded by Playwright config.
    await page.goto("/overview");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    // Dismiss "Welcome to VerifyWise" dialog if it appears
    const welcomeSkip = page.getByRole("button", { name: /skip for now/i });
    if (await welcomeSkip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await welcomeSkip.click();
      await page.waitForTimeout(1000);
    }

    // Click the "New use case" button
    const newProjectBtn = page
      .locator('[data-joyride-id="new-project-button"]')
      .or(page.getByRole("button", { name: /new use case/i }))
      .or(page.getByRole("button", { name: /add.*project/i }))
      .or(page.getByRole("button", { name: /new project/i }));
    await expect(newProjectBtn.first()).toBeVisible({ timeout: 15_000 });
    await newProjectBtn.first().click();

    // Handle AI-or-Not screening modal if it appears
    const skipBtn = page
      .getByRole("button", { name: /skip/i })
      .or(page.getByRole("button", { name: /no/i }));
    if (await skipBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.first().click();
      await page.waitForTimeout(500);
    }

    // Fill project title — the input is an unlabeled textbox under "Use case title*"
    // Use the text label to locate the adjacent input
    const titleInput = page
      .getByText(/use case title/i)
      .locator("..")
      .getByRole("textbox");
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
    await titleInput.first().fill(projectName);

    // Fill Goal field (required) — unlabeled textbox under "Goal*"
    const goalInput = page
      .getByText(/^Goal/i)
      .locator("..")
      .getByRole("textbox");
    if (await goalInput.first().isVisible().catch(() => false)) {
      await goalInput.first().fill("E2E test goal");
    }

    // Select Owner if dropdown exists
    const ownerSelect = page
      .getByText(/^Owner/i)
      .locator("..")
      .getByRole("combobox");
    if (await ownerSelect.first().isVisible().catch(() => false)) {
      await ownerSelect.first().click();
      const option = page.getByRole("option").first();
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
      }
    }

    // Select AI risk classification if dropdown exists
    const riskSelect = page
      .getByText(/AI risk classification/i)
      .locator("..")
      .getByRole("combobox");
    if (await riskSelect.first().isVisible().catch(() => false)) {
      await riskSelect.first().click();
      const option = page.getByRole("option").first();
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
      }
    }

    // Select Type of high risk role if dropdown exists
    const highRiskSelect = page
      .getByText(/Type of high risk role/i)
      .locator("..")
      .getByRole("combobox");
    if (await highRiskSelect.first().isVisible().catch(() => false)) {
      await highRiskSelect.first().click();
      const option = page.getByRole("option").first();
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
      }
    }

    // Select Geography if dropdown exists
    const geoSelect = page
      .getByText(/^Geography/i)
      .locator("..")
      .getByRole("combobox");
    if (await geoSelect.first().isVisible().catch(() => false)) {
      // Already has "Global" selected by default — skip
    }

    // Submit the project creation form
    const submitBtn = page.getByRole("button", { name: /create use case/i });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    await use(page);
  },
});

export { expect };
