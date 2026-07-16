import { test as base, expect, type Page } from "@playwright/test";

const ADMIN_AUTH_STATE = "e2e/.auth/admin.json";

/**
 * Extended test fixture that provides an authenticated page with a project
 * already created. Many entities (vendors, risks, datasets) require a
 * project to exist before they can be created.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/project.fixture";
 *   test("my test", async ({ projectPage, projectName }) => { ... });
 *
 * For CRUD tests that need admin permissions (not super-admin):
 *   import { test, expect } from "../fixtures/project.fixture";
 *   test("my test", async ({ adminProjectPage, projectName }) => { ... });
 */
export const test = base.extend<{
  projectPage: Page;
  adminProjectPage: Page;
  projectName: string;
}>({
  projectName: async ({}, use) => {
    await use(`E2E-Project-${Date.now()}`);
  },

  projectPage: async ({ page, projectName }, use) => {
    // storageState is already loaded by Playwright config.
    await page.goto("/overview");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    // Dismiss notifications panel if open
    const closeNotifications = page.getByRole("button", { name: /close notifications/i });
    if (await closeNotifications.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeNotifications.click();
      await page.waitForTimeout(300);
    }

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
    const skipBtn = page.getByRole("button", { name: /skip.*screening/i });
    if (
      await skipBtn
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await skipBtn.first().click();
      await page.waitForTimeout(500);
    }

    // Wait for the project form modal to appear
    const formTitle = page.getByText(/create new use case/i).or(page.getByText(/create new project/i));
    await expect(formTitle.first()).toBeVisible({ timeout: 10_000 });

    // Fill project title using the stable id from ProjectForm
    const titleInput = page.locator("#project-title-input");
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(projectName);

    // Fill Goal field (required) — unlabeled textbox under "Goal*"
    const goalInput = page.getByText(/^Goal/i).locator("..").getByRole("textbox");
    if (
      await goalInput
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await goalInput.first().fill("E2E test goal");
    }

    // Select Owner if dropdown exists
    const ownerSelect = page
      .getByText(/^Owner/i)
      .locator("..")
      .getByRole("combobox");
    if (
      await ownerSelect
        .first()
        .isVisible()
        .catch(() => false)
    ) {
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
    if (
      await riskSelect
        .first()
        .isVisible()
        .catch(() => false)
    ) {
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
    if (
      await highRiskSelect
        .first()
        .isVisible()
        .catch(() => false)
    ) {
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
    if (
      await geoSelect
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      // Already has "Global" selected by default — skip
    }

    // Submit the project creation form
    const submitBtn = page.getByRole("button", { name: /create use case/i });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    await use(page);
  },

  adminProjectPage: async ({ browser, projectName }, use) => {
    const context = await browser.newContext({ storageState: ADMIN_AUTH_STATE });
    const page = await context.newPage();
    await page.goto("/overview");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    // Dismiss notifications panel if open
    const closeNotifications = page.getByRole("button", { name: /close notifications/i });
    if (await closeNotifications.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeNotifications.click();
      await page.waitForTimeout(300);
    }

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
    const skipBtn = page.getByRole("button", { name: /skip.*screening/i });
    if (
      await skipBtn
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await skipBtn.first().click();
      await page.waitForTimeout(500);
    }

    // Wait for the project form modal to appear
    const formTitle = page.getByText(/create new use case/i).or(page.getByText(/create new project/i));
    await expect(formTitle.first()).toBeVisible({ timeout: 10_000 });

    // Fill project title
    const titleInput = page.locator("#project-title-input");
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(projectName);

    // Submit the project creation form
    const submitBtn = page.getByRole("button", { name: /create use case/i });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    await use(page);
    await context.close();
  },
});

export { expect };
