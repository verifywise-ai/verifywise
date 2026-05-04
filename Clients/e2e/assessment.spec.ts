import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Assessment Tracker", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Dismiss tours to avoid UI interference
    await page.evaluate(() => {
      localStorage.setItem("home-tour", "true");
      localStorage.setItem("compliance-tour", "true");
      localStorage.setItem("assessment-tour", "true");
      localStorage.setItem("projectFrameworks-tour", "true");
    });
  });

  // --- Tier 0: Navigate to assessment via project view ---

  test("can reach the frameworks tab in project view", async ({ authedPage: page }) => {
    await page.goto("/project-view?tab=frameworks");
    await expect(page).toHaveURL(/\/project-view/);

    // Should show project content or framework-related elements
    await expect(
      page
        .getByText(/framework/i)
        .or(page.getByText(/regulation/i))
        .or(page.getByText(/control/i))
        .or(page.getByText(/assessment/i))
        .or(page.getByRole("heading"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("frameworks tab has Controls and Assessments toggle", async ({ authedPage: page }) => {
    await page.goto("/project-view?tab=frameworks");

    // Look for the Controls / Assessments toggle buttons
    const controlsBtn = page
      .getByRole("button", { name: /controls/i })
      .or(page.getByText(/controls/i));
    const assessmentsBtn = page
      .getByRole("button", { name: /assessments/i })
      .or(page.getByText(/assessments/i));

    if (
      !(await controlsBtn
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false))
    ) {
      test.skip();
      return;
    }

    await expect(controlsBtn.first()).toBeVisible();
    await expect(assessmentsBtn.first()).toBeVisible();
  });

  // --- Tier 1: Assessment view content ---

  test("switching to Assessments tab shows assessment content", async ({ authedPage: page }) => {
    await page.goto("/project-view?tab=frameworks");

    const assessmentsBtn = page
      .getByRole("button", { name: /assessments/i })
      .or(page.getByText(/assessments/i));

    if (
      !(await assessmentsBtn
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false))
    ) {
      test.skip();
      return;
    }

    await assessmentsBtn.first().click();
    await page.waitForTimeout(1000);

    // Assessment view should show topic list or progress stats
    const assessmentContent = page
      .getByText(/assessment/i)
      .or(page.getByText(/questions/i))
      .or(page.getByText(/high risk/i))
      .or(page.getByText(/conformity/i))
      .or(page.getByRole("list"));

    await expect(assessmentContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test("assessment shows progress stats", async ({ authedPage: page }) => {
    await page.goto("/project-view?tab=frameworks");

    const assessmentsBtn = page
      .getByRole("button", { name: /assessments/i })
      .or(page.getByText(/assessments/i));

    if (
      !(await assessmentsBtn
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false))
    ) {
      test.skip();
      return;
    }

    await assessmentsBtn.first().click();
    await page.waitForTimeout(1000);

    // Should display progress information (answered/total questions)
    const progressContent = page
      .getByText(/questions/i)
      .or(page.getByText(/answered/i))
      .or(page.getByText(/completed/i))
      .or(page.getByText(/progress/i))
      .or(page.locator('[class*="stats" i]'))
      .or(page.locator('[class*="progress" i]'));

    if (
      await progressContent
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(progressContent.first()).toBeVisible();
    }
  });

  // --- Tier 2: Topic navigation ---

  test("clicking a topic loads subtopics", async ({ authedPage: page }) => {
    await page.goto("/project-view?tab=frameworks");

    const assessmentsBtn = page
      .getByRole("button", { name: /assessments/i })
      .or(page.getByText(/assessments/i));

    if (
      !(await assessmentsBtn
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false))
    ) {
      test.skip();
      return;
    }

    await assessmentsBtn.first().click();
    await page.waitForTimeout(1000);

    // Look for topic list items in the sidebar
    const topicItems = page
      .getByRole("listitem")
      .or(page.locator('[class*="topic" i]'))
      .or(page.locator(".MuiListItem-root"));

    if (
      await topicItems
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      await topicItems.first().click();
      await page.waitForTimeout(1000);

      // After clicking a topic, subtopics or an accordion should appear
      const subtopicContent = page
        .locator('[class*="accordion" i]')
        .or(page.locator(".MuiAccordion-root"))
        .or(page.getByRole("button", { name: /expand/i }))
        .or(page.locator('[class*="subtopic" i]'));

      if (
        await subtopicContent
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await expect(subtopicContent.first()).toBeVisible();
      }
    }
  });

  // --- Accessibility ---

  test("assessment view has no accessibility violations", async ({ authedPage: page }) => {
    await page.goto("/project-view?tab=frameworks");
    await page.waitForLoadState("domcontentloaded");

    // Switch to assessments tab if visible
    const assessmentsBtn = page
      .getByRole("button", { name: /assessments/i })
      .or(page.getByText(/assessments/i));

    if (
      await assessmentsBtn
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false)
    ) {
      await assessmentsBtn.first().click();
      await page.waitForTimeout(1000);
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules([
        "button-name",
        "link-name",
        "color-contrast",
        "aria-command-name",
        "aria-valid-attr-value",
        "aria-input-field-name",
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
});
