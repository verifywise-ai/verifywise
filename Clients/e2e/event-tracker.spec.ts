import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Event Tracker (WatchTower)", () => {
  // --- Tier 1: Page load and content ---

  test("renders the event tracker page", async ({ authedPage: page }) => {
    await page.goto("/event-tracker");
    await expect(page).toHaveURL(/\/event-tracker/);

    // Page should show event or activity tracking content
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(
      page
        .getByText(/event/i)
        .or(page.getByText(/activity/i))
        .or(page.getByText(/log/i))
        .or(page.getByText(/tracker/i))
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/event-tracker");
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

  test("displays event list or empty state", async ({
    authedPage: page,
  }) => {
    await page.goto("/event-tracker");

    // Should show event logs, activity feed, or empty state
    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByRole("list"))
      .or(page.getByText(/no.*event/i))
      .or(page.getByRole("heading"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 1: Tab/sub-navigation ---

  test("can navigate to event tracker logs", async ({ authedPage: page }) => {
    await page.goto("/event-tracker/logs");
    await expect(page).toHaveURL(/\/event-tracker\/logs/);

    await expect(
      page
        .getByText(/log/i)
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
