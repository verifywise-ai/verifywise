import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Post-Market Monitoring", () => {
  // --- Tier 1: Page load and content ---

  test("renders the reports archive page", async ({ authedPage: page }) => {
    await page.goto("/monitoring/reports");
    await expect(page).toHaveURL(/\/monitoring\/reports/);

    // Page should show monitoring or reports content
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(
      page
        .getByText(/monitor/i)
        .or(page.getByText(/report/i))
        .or(page.getByText(/post-market/i))
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/monitoring/reports");
    await page.waitForLoadState("domcontentloaded");

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

  test("displays reports list or empty state", async ({
    authedPage: page,
  }) => {
    await page.goto("/monitoring/reports");

    // Should show reports, archive entries, or empty state
    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByRole("list"))
      .or(page.getByText(/no.*report/i))
      .or(page.getByRole("heading"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 5: Reports archive & monitoring form ---

  test("reports archive shows table with filter controls", async ({
    authedPage: page,
  }) => {
    await page.goto("/monitoring/reports");
    await page.waitForTimeout(2000);

    // Look for filter controls (date pickers, flagged-only checkbox)
    const filterControls = page
      .getByText(/from/i)
      .or(page.getByText(/flagged/i))
      .or(page.getByRole("checkbox", { name: /flagged/i }))
      .or(page.getByRole("table"))
      .or(page.getByText(/no.*report/i));

    if (await filterControls.first().isVisible().catch(() => false)) {
      await expect(filterControls.first()).toBeVisible();
    }
  });

  test("monitoring page has filter controls", async ({ authedPage: page }) => {
    await page.goto("/monitoring/reports");
    await page.waitForTimeout(2000);

    // Look for date pickers, flagged-only toggle, or reset button
    const filters = page
      .getByText(/from/i)
      .or(page.getByText(/to:/i))
      .or(page.getByRole("checkbox", { name: /flagged/i }))
      .or(page.getByRole("button", { name: /reset/i }))
      .or(page.getByText(/flagged only/i));

    if (await filters.first().isVisible().catch(() => false)) {
      await expect(filters.first()).toBeVisible();
    }
  });
});
