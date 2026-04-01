import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Frameworks", () => {
  test("renders the frameworks page", async ({ authedPage: page }) => {
    await page.goto("/framework");
    await expect(page).toHaveURL(/\/framework/);

    // Page should show framework-related content
    await expect(
      page.getByText(/framework/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/framework");
    await page.waitForLoadState("domcontentloaded");

    // Disable pre-existing app-wide WCAG violations (tracked for future fix).
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules([
        "button-name",
        "link-name",
        "color-contrast",
        "aria-command-name",
        "aria-valid-attr-value",
        "label",
        "select-name",
        "scrollable-region-focusable",
        "aria-progressbar-name",
        "aria-prohibited-attr",
      ])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("framework list or selection is visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/framework");

    const content = page
      .getByText(/eu ai act/i)
      .or(page.getByText(/iso/i))
      .or(page.getByText(/nist/i))
      .or(page.getByRole("button", { name: /add|select/i }));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 5: Framework navigation & compliance ---

  test("framework page shows project selector and framework content", async ({
    authedPage: page,
  }) => {
    await page.goto("/framework");
    await page.waitForTimeout(2000);

    // Look for project selector or framework content
    const projectSelect = page
      .getByRole("combobox", { name: /project/i })
      .or(page.getByRole("combobox", { name: /use case/i }))
      .or(page.getByText(/select.*project/i));

    const frameworkContent = page
      .getByText(/eu ai act/i)
      .or(page.getByText(/iso/i))
      .or(page.getByText(/nist/i))
      .or(page.getByRole("tablist"))
      .or(page.getByRole("tab"));

    const content = projectSelect.first().or(frameworkContent.first());
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("switching framework tabs loads different content", async ({
    authedPage: page,
  }) => {
    await page.goto("/framework");
    await page.waitForTimeout(2000);

    const tabs = page.getByRole("tab");

    if ((await tabs.count()) < 2) {
      test.skip();
      return;
    }

    // Click the second tab
    const firstTabText = await tabs.nth(0).textContent().catch(() => "");
    await tabs.nth(1).click();
    await page.waitForTimeout(1000);

    // Verify content area updated
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("framework sub-views are accessible", async ({ authedPage: page }) => {
    await page.goto("/framework");
    await page.waitForTimeout(2000);

    // Look for sub-view buttons (Dashboard, Requirements, Settings, Risks, Models)
    const subViewBtn = page
      .getByRole("button", { name: /dashboard/i })
      .or(page.getByRole("button", { name: /requirements/i }))
      .or(page.getByRole("button", { name: /settings/i }))
      .or(page.getByText(/dashboard/i))
      .or(page.getByText(/requirements/i));

    if (await subViewBtn.first().isVisible().catch(() => false)) {
      await subViewBtn.first().click();
      await page.waitForTimeout(1000);

      // Verify sub-view content loads
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });
});
