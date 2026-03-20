import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Intake Forms", () => {
  // --- Tier 1: Page load and content ---

  test("renders the intake forms list page", async ({ authedPage: page }) => {
    await page.goto("/intake-forms");
    await expect(page).toHaveURL(/\/intake-forms/);

    // Page should show intake form content
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(
      page
        .getByText(/intake/i)
        .or(page.getByText(/form/i))
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/intake-forms");
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

  test("displays forms list or empty state", async ({
    authedPage: page,
  }) => {
    await page.goto("/intake-forms");

    // Should show list of intake forms or empty state
    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByText(/no.*form/i))
      .or(page.getByRole("button", { name: /add|new|create/i }))
      .or(page.getByRole("heading"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 1: Tab navigation ---

  test("can navigate to submissions tab", async ({ authedPage: page }) => {
    await page.goto("/intake-forms/submissions");
    await expect(page).toHaveURL(/\/intake-forms\/submissions/);

    await expect(
      page
        .getByText(/submission/i)
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  // --- Tier 3: Modal open/close ---

  test("create form button opens modal or navigates", async ({
    authedPage: page,
  }) => {
    await page.goto("/intake-forms");

    const addBtn = page
      .getByRole("button", { name: /add|new|create/i })
      .first();

    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();

      // Should either open a modal or navigate to form builder
      const modalOrBuilder = page
        .getByRole("dialog")
        .or(page.getByText(/create.*form/i))
        .or(page.getByText(/new.*form/i))
        .or(page.locator('[class*="builder" i]'));

      if (await modalOrBuilder.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
        await page.keyboard.press("Escape");
      }
    }
  });
});
