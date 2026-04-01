import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Overview (Home)", () => {
  // --- Tier 1: Page load and content ---

  test("renders the overview page", async ({ authedPage: page }) => {
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/overview/);

    // Page should display overview or home content
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(
      page
        .getByRole("heading")
        .or(page.getByText(/overview/i))
        .or(page.getByText(/home/i))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/overview");
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

  test("displays project or summary content", async ({
    authedPage: page,
  }) => {
    await page.goto("/overview");

    // Should show project cards, summary stats, or content area
    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.locator('[class*="card" i]').first())
      .or(page.getByRole("heading"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
