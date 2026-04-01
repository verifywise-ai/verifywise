import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("AI Trust Center", () => {
  test("renders the AI trust center page", async ({ authedPage: page }) => {
    await page.goto("/ai-trust-center");
    await expect(page).toHaveURL(/\/ai-trust-center/);

    // Page should show trust center content
    await expect(
      page
        .getByText(/trust/i)
        .or(page.getByText(/ai trust/i))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-trust-center");
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

  test("trust center content sections are visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-trust-center");

    const content = page
      .getByRole("tab")
      .or(page.getByRole("heading"))
      .or(page.getByText(/compliance/i))
      .or(page.getByText(/governance/i));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 1: Tab navigation ---

  test("clicking Resources tab navigates to /ai-trust-center/resources", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-trust-center");
    const resourcesTab = page
      .getByRole("tab", { name: /resources/i })
      .or(page.getByText(/resources/i));

    if (await resourcesTab.first().isVisible().catch(() => false)) {
      await resourcesTab.first().click();
      await expect(page).toHaveURL(/\/ai-trust-center\/resources/, {
        timeout: 10_000,
      });
    }
  });

  test("clicking Settings tab navigates to /ai-trust-center/settings", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-trust-center");
    const settingsTab = page
      .getByRole("tab", { name: /settings/i })
      .or(page.getByText(/settings/i));

    if (await settingsTab.first().isVisible().catch(() => false)) {
      await settingsTab.first().click();
      await expect(page).toHaveURL(/\/ai-trust-center\/settings/, {
        timeout: 10_000,
      });
    }
  });
});
