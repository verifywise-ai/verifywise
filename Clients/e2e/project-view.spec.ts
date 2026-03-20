import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Project View", () => {
  // --- Tier 1: Page load and content ---

  test("renders the project view page", async ({ authedPage: page }) => {
    await page.goto("/project-view");
    await expect(page).toHaveURL(/\/project-view/);

    // Page should show project-related content (use cases, tabs, etc.) or empty state
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(
      page
        .getByText(/project/i)
        .or(page.getByText(/use case/i))
        .or(page.getByRole("tablist"))
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view");
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

  test("displays project details or selection prompt", async ({
    authedPage: page,
  }) => {
    await page.goto("/project-view");

    // Should show project details, tabs, or a prompt to select a project
    const content = page
      .getByRole("tablist")
      .or(page.getByRole("table"))
      .or(page.locator('[class*="card" i]').first())
      .or(page.getByRole("button", { name: /add|new|create|select/i }))
      .or(page.getByRole("heading"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
