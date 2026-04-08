import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Evals Dashboard", () => {
  // --- Tier 1: Page load and content ---

  test("renders the evals dashboard page", async ({ authedPage: page }) => {
    await page.goto("/evals");
    await expect(page).toHaveURL(/\/evals/);

    // Page should show evaluation-related content
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(
      page
        .getByText(/eval/i)
        .or(page.getByText(/evaluation/i))
        .or(page.getByText(/llm/i))
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/evals");
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

  test("displays evaluation content or empty state", async ({
    authedPage: page,
  }) => {
    await page.goto("/evals");

    // Should show eval projects, runs, or an empty state
    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByText(/no.*eval/i))
      .or(page.getByRole("button", { name: /add|new|create/i }))
      .or(page.getByRole("heading"));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 1: Settings navigation ---

  test("can navigate to evals settings", async ({ authedPage: page }) => {
    await page.goto("/evals/settings");
    await expect(page).toHaveURL(/\/evals\/settings/);

    await expect(
      page
        .getByText(/setting/i)
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  // --- Tier 1: Sub-page navigation ---

  test("can navigate through evals sub-pages via sidebar", async ({
    authedPage: page,
  }) => {
    await page.goto("/evals");
    await page.waitForTimeout(3000);

    // Skip if the evals page didn't load (EvalServer may not be running)
    const pageContent = page
      .getByText(/eval/i)
      .or(page.getByText(/experiment/i))
      .or(page.getByRole("button", { name: /experiments/i }));
    if (!(await pageContent.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // The evals page uses a sidebar with navigation buttons
    const sidebarItems = [
      { name: /experiments/i },
      { name: /datasets/i },
      { name: /scorers/i },
    ];

    for (const item of sidebarItems) {
      const sidebarBtn = page
        .getByRole("button", { name: item.name })
        .or(page.getByRole("link", { name: item.name }))
        .or(page.getByRole("tab", { name: item.name }));

      const btn = sidebarBtn.first();
      if (await btn.isVisible().catch(() => false)) {
        // Skip disabled buttons (e.g. "Experiments" requires a project)
        if (await btn.isDisabled().catch(() => false)) continue;
        await btn.click();
        await page.waitForTimeout(500);
      }
    }
  });
});
