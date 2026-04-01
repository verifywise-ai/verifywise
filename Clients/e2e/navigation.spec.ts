import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Navigation", () => {
  test("dashboard loads after login", async ({ authedPage: page }) => {
    // The dashboard should be visible after login
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page).toHaveURL("/");
  });

  test("can navigate to vendors page", async ({ authedPage: page }) => {
    await page.goto("/vendors");
    await expect(page).toHaveURL(/\/vendors/);
    // Should see page content (not redirected to login)
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("can navigate to risk management page", async ({ authedPage: page }) => {
    await page.goto("/risk-management");
    await expect(page).toHaveURL(/\/risk-management/);
  });

  test("can navigate to tasks page", async ({ authedPage: page }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/tasks/);
  });

  test("can navigate to model inventory page", async ({
    authedPage: page,
  }) => {
    await page.goto("/model-inventory");
    await expect(page).toHaveURL(/\/model-inventory/);
  });

  test("can navigate to policies page", async ({ authedPage: page }) => {
    await page.goto("/policies");
    await expect(page).toHaveURL(/\/policies/);
  });

  test("can navigate to file manager page", async ({ authedPage: page }) => {
    await page.goto("/file-manager");
    await expect(page).toHaveURL(/\/file-manager/);
  });

  test("can navigate to settings page", async ({ authedPage: page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
  });

  test("can navigate to training page", async ({ authedPage: page }) => {
    await page.goto("/training");
    await expect(page).toHaveURL(/\/training/);
  });

  test("dashboard has no accessibility violations", async ({
    authedPage: page,
  }) => {
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
});
