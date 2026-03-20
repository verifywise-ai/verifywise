import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Page Not Found (404)", () => {
  test("renders the 404 page for unknown routes", async ({
    authedPage: page,
  }) => {
    await page.goto("/this-page-does-not-exist-e2e-test");

    // Should show a 404 or "not found" message
    await expect(
      page
        .getByText(/not found/i)
        .or(page.getByText(/404/i))
        .or(page.getByText(/page.*exist/i))
        .or(page.getByText(/oops/i))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/this-page-does-not-exist-e2e-test");
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

  test("provides a way to navigate back", async ({ authedPage: page }) => {
    await page.goto("/this-page-does-not-exist-e2e-test");

    // Should provide a way to go back to home/dashboard
    const backLink = page.getByText(/back to home/i);
    await expect(backLink.first()).toBeVisible({ timeout: 10_000 });
  });
});
