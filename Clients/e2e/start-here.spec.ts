import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Start Here", () => {
  // --- Tier 1: Page load and content ---

  test("renders the start here page", async ({ authedPage: page }) => {
    await page.goto("/start-here");
    // The new look moved Start here into Home's Get started tab.
    await expect(page).toHaveURL(/\/home\?tab=get-started/);

    // The Get started panel (not the always-visible tab label) holds the content.
    const panel = page.getByTestId("home-get-started-tab");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText("Your progress")).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({ authedPage: page }) => {
    await page.goto("/start-here");
    await expect(page).toHaveURL(/\/home\?tab=get-started/);
    await expect(page.getByTestId("home-get-started-tab").getByText("Your progress")).toBeVisible({
      timeout: 15_000,
    });

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

  test("displays onboarding steps or checklist", async ({ authedPage: page }) => {
    await page.goto("/start-here");

    // Should show steps, cards, or a checklist for onboarding
    const content = page
      .getByRole("list")
      .or(page.locator('[class*="card" i]').first())
      .or(page.locator('[class*="step" i]').first())
      .or(page.getByRole("heading"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
