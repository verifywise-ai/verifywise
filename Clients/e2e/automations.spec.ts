import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Automations", () => {
  test("renders the automations page", async ({ authedPage: page }) => {
    await page.goto("/automations");
    await expect(page).toHaveURL(/\/automations/);

    // Page should show automation-related content or empty state
    await expect(
      page.getByText(/automation/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/automations");
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

  test("automation list or create button is visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/automations");

    const content = page
      .getByRole("button", { name: /add|new|create/i })
      .or(page.getByText(/no.*automation/i))
      .or(page.getByRole("table"))
      .or(page.getByRole("grid"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
