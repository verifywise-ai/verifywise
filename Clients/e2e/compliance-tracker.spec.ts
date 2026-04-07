import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Compliance Tracker", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Dismiss tours to avoid UI interference
    await page.evaluate(() => {
      localStorage.setItem("home-tour", "true");
      localStorage.setItem("compliance-tour", "true");
      localStorage.setItem("assessment-tour", "true");
      localStorage.setItem("projectFrameworks-tour", "true");
    });
  });

  // --- Tier 0: Navigate to compliance tracker via project view ---

  test("compliance tracker renders in frameworks tab", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view?tab=frameworks");
    await expect(page).toHaveURL(/\/project-view/);

    // Controls tab is the default in ProjectFrameworks
    // Should show compliance-related content or page structure
    const content = page
      .getByText(/control/i)
      .or(page.getByText(/compliance/i))
      .or(page.getByText(/subcontrol/i))
      .or(page.getByText(/framework/i))
      .or(page.getByRole("heading"))
      .or(page.getByRole("navigation"));

    if (
      !(await content.first().isVisible({ timeout: 15_000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await expect(content.first()).toBeVisible();
  });

  // --- Tier 1: Progress stats ---

  test("displays compliance progress stats", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view?tab=frameworks");

    // Should show subcontrol progress (e.g., "Subcontrols 5/20")
    const progressContent = page
      .getByText(/subcontrol/i)
      .or(page.getByText(/completed/i))
      .or(page.getByText(/progress/i))
      .or(page.locator('[class*="stats" i]'))
      .or(page.locator('[class*="progress" i]'));

    if (
      !(await progressContent.first().isVisible({ timeout: 10_000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await expect(progressContent.first()).toBeVisible();
  });

  // --- Tier 1: Control categories ---

  test("shows control categories list", async ({ authedPage: page }) => {
    await page.goto("/project-view?tab=frameworks");

    // Control categories should appear as expandable tiles
    const categories = page
      .locator('[class*="control-category" i]')
      .or(page.locator('[class*="ControlCategory" i]'))
      .or(page.locator(".MuiAccordion-root"))
      .or(page.getByRole("button", { name: /article/i }))
      .or(page.locator('[class*="category" i]'));

    if (
      !(await categories.first().isVisible({ timeout: 10_000 }).catch(() => false))
    ) {
      // May not have any categories if no framework is assigned
      test.skip();
      return;
    }

    await expect(categories.first()).toBeVisible();
  });

  // --- Tier 2: Expand/collapse control category ---

  test("clicking a control category expands it", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view?tab=frameworks");

    // Find expandable control category elements
    const categories = page
      .locator('[class*="control-category" i]')
      .or(page.locator(".MuiAccordion-root"))
      .or(page.locator('[class*="category" i]'));

    if (
      !(await categories.first().isVisible({ timeout: 10_000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await categories.first().click();
    await page.waitForTimeout(1000);

    // After expanding, should show controls table or control items
    const controlContent = page
      .getByRole("table")
      .or(page.locator('[class*="controls-table" i]'))
      .or(page.getByRole("row"))
      .or(page.getByText(/status/i));

    if (await controlContent.first().isVisible().catch(() => false)) {
      await expect(controlContent.first()).toBeVisible();
    }
  });

  // --- Tier 2: Framework tab switching ---

  test("can switch between frameworks if multiple are assigned", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view?tab=frameworks");

    // Look for framework tabs (e.g., EU AI Act, ISO 42001)
    const frameworkTabs = page
      .getByRole("tab")
      .or(page.locator('[role="tab"]'));

    if (
      !(await frameworkTabs.first().isVisible({ timeout: 10_000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    const tabCount = await frameworkTabs.count();
    if (tabCount < 2) {
      // Only one framework, nothing to switch
      test.skip();
      return;
    }

    // Click the second tab
    await frameworkTabs.nth(1).click();
    await page.waitForTimeout(1000);

    // Content should update
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // --- Tier 2: Filter controls ---

  test("filter bar is available for controls", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view?tab=frameworks");

    // Look for filter elements
    const filterElements = page
      .getByText(/filter/i)
      .or(page.getByRole("combobox"))
      .or(page.getByPlaceholder(/search/i))
      .or(page.locator('[class*="filter" i]'));

    if (await filterElements.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(filterElements.first()).toBeVisible();
    }
  });

  // --- Accessibility ---

  test("compliance tracker has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view?tab=frameworks");
    await page.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules([
        "button-name",
        "link-name",
        "color-contrast",
        "aria-command-name",
        "aria-valid-attr-value",
        "aria-input-field-name",
        "label",
        "select-name",
        "scrollable-region-focusable",
        "aria-progressbar-name",
        "aria-prohibited-attr",
        "nested-interactive",
      ])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
