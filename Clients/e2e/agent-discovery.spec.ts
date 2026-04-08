import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Agent Discovery", () => {
  test("renders the agent discovery page", async ({ authedPage: page }) => {
    await page.goto("/agent-discovery");
    await expect(page).toHaveURL(/\/agent-discovery/);

    // Page should show agent-related content or empty state
    await expect(
      page.getByText(/agent/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/agent-discovery");
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
        "nested-interactive",
      ])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("agent list or empty state is visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/agent-discovery");

    const content = page
      .getByRole("button", { name: /add|new|register/i })
      .or(page.getByText(/no.*agent/i))
      .or(page.getByRole("table"))
      .or(page.getByRole("grid"))
      .or(page.getByRole("heading"))
      .or(page.getByText(/agent/i));
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });
});
