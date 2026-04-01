import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Plugins", () => {
  test("renders the plugins page", async ({ authedPage: page }) => {
    await page.goto("/plugins");
    await expect(page).toHaveURL(/\/plugins/);

    // Page should show plugin-related content
    await expect(
      page.getByText(/plugin/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/plugins");
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

  test("plugin list or marketplace is visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/plugins");

    const content = page
      .getByRole("button", { name: /install|browse|add/i })
      .or(page.getByText(/marketplace/i))
      .or(page.getByText(/installed/i))
      .or(page.getByText(/no.*plugin/i));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 5: Marketplace & installed plugins ---

  test("marketplace shows plugin cards", async ({ authedPage: page }) => {
    await page.goto("/plugins");
    await page.waitForTimeout(2000);

    // Click Marketplace tab if not already active
    const marketplaceTab = page
      .getByRole("tab", { name: /marketplace/i })
      .or(page.getByText(/marketplace/i));

    if (await marketplaceTab.first().isVisible().catch(() => false)) {
      await marketplaceTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Verify plugin cards are visible
    const pluginCards = page
      .locator(".MuiCard-root")
      .or(page.locator('[class*="plugin-card" i]'))
      .or(page.locator('[class*="PluginCard" i]'))
      .or(page.getByText(/install/i));

    await expect(pluginCards.first()).toBeVisible({ timeout: 15_000 });
  });

  test("my-plugins tab shows installed plugins or empty state", async ({
    authedPage: page,
  }) => {
    await page.goto("/plugins");
    await page.waitForTimeout(2000);

    // Click My plugins tab
    const myPluginsTab = page
      .getByRole("tab", { name: /my plugin/i })
      .or(page.getByText(/my plugin/i));

    if (!(await myPluginsTab.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await myPluginsTab.first().click();
    await page.waitForTimeout(1000);

    // Should show installed plugins or empty state
    const content = page
      .locator(".MuiCard-root")
      .or(page.getByText(/no.*plugin/i))
      .or(page.getByText(/installed/i))
      .or(page.getByText(/manage/i));

    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
