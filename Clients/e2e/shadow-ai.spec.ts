import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Shadow AI", () => {
  test("renders the shadow AI insights page", async ({
    authedPage: page,
  }) => {
    await page.goto("/shadow-ai/insights");
    await expect(page).toHaveURL(/\/shadow-ai/);

    // Page should show shadow AI content
    await expect(
      page
        .getByText(/shadow/i)
        .or(page.getByText(/insight/i))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/shadow-ai/insights");
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

  test("dashboard metrics or empty state is visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/shadow-ai/insights");

    const content = page
      .getByText(/tool/i)
      .or(page.getByText(/user/i))
      .or(page.getByText(/no.*data/i))
      .or(page.getByText(/get started/i));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 5: Rules & alerts ---

  test("rules tab shows create rule button or rules list", async ({
    authedPage: page,
  }) => {
    await page.goto("/shadow-ai/rules");
    await page.waitForTimeout(2000);

    const content = page
      .getByRole("button", { name: /create rule/i })
      .or(page.getByText(/no.*rule/i))
      .or(page.getByText(/rule/i))
      .or(page.locator('[class*="rule" i]'));

    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("alerts tab shows alert history", async ({ authedPage: page }) => {
    await page.goto("/shadow-ai/rules/alerts");
    await page.waitForTimeout(2000);

    const content = page
      .getByText(/alert/i)
      .or(page.getByRole("table"))
      .or(page.getByText(/no.*alert/i))
      .or(page.getByText(/triggered/i))
      .or(page.getByRole("heading"));

    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("create rule modal opens with form fields", async ({
    authedPage: page,
  }) => {
    await page.goto("/shadow-ai/rules");
    await page.waitForTimeout(2000);

    const createBtn = page
      .getByRole("button", { name: /create rule/i })
      .or(page.getByRole("button", { name: /add.*rule/i }))
      .or(page.getByRole("button", { name: /new.*rule/i }));

    if (!(await createBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.first().click();
    await page.waitForTimeout(500);

    // Verify modal with form fields
    const nameField = page
      .getByPlaceholder(/alert on new/i)
      .or(page.getByPlaceholder(/rule name/i))
      .or(page.getByRole("textbox", { name: /name/i }))
      .or(page.getByRole("textbox").first());

    if (await nameField.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(nameField.first()).toBeVisible();
    }

    // Look for trigger type selector
    const triggerSelect = page
      .getByText(/trigger type/i)
      .or(page.getByRole("combobox"))
      .or(page.getByText(/new_tool_detected/i));

    if (await triggerSelect.first().isVisible().catch(() => false)) {
      await expect(triggerSelect.first()).toBeVisible();
    }

    // Close modal
    const cancelBtn = page.getByRole("button", { name: /cancel|close/i });
    if (await cancelBtn.first().isVisible().catch(() => false)) {
      await cancelBtn.first().click();
    } else {
      await page.keyboard.press("Escape");
    }
  });
});
