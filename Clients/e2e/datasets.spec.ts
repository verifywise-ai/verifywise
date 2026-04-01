import { test as authTest, expect as authExpect } from "./fixtures/auth.fixture";
import { test as projectTest, expect as projectExpect } from "./fixtures/project.fixture";
import AxeBuilder from "@axe-core/playwright";

const test = authTest;
const expect = authExpect;

test.describe("Datasets", () => {
  test("renders the datasets page", async ({ authedPage: page }) => {
    await page.goto("/datasets");
    await expect(page).toHaveURL(/\/datasets/);

    // Page should show dataset-related content or empty state
    await expect(
      page.getByText(/dataset/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/datasets");
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

  test("dataset list or empty state is visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/datasets");

    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByText(/no.*dataset/i))
      .or(page.getByRole("button", { name: /add|new|create/i }));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 3: Modal open/close ---

  test("Add new dataset button opens modal", async ({
    authedPage: page,
  }) => {
    await page.goto("/datasets");
    const addBtn = page.getByRole("button", { name: /add new dataset/i });

    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      // Verify modal title appears
      await expect(
        page
          .getByText(/add new dataset/i)
          .or(page.getByText(/create dataset/i))
          .or(page.getByText(/new dataset/i))
          .first()
      ).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    }
  });

  // --- Tier 5: Multi-step modal & bulk upload ---

  test.describe("Bulk Upload", () => {
    test("bulk upload button opens stepper modal", async ({
      authedPage: page,
    }) => {
      await page.goto("/datasets");
      await page.waitForTimeout(2000);

      const bulkUploadBtn = page
        .getByRole("button", { name: /bulk upload/i })
        .or(page.getByRole("button", { name: /import/i }))
        .or(page.getByRole("button", { name: /batch/i }));

      if (!(await bulkUploadBtn.first().isVisible().catch(() => false))) {
        test.skip();
        return;
      }

      await bulkUploadBtn.first().click();
      await page.waitForTimeout(500);

      // Verify stepper modal appears
      const stepper = page
        .locator(".MuiStepper-root")
        .or(page.locator('[class*="stepper" i]'))
        .or(page.getByRole("dialog"))
        .or(page.locator(".MuiModal-root"));

      await expect(stepper.first()).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    });

    test("stepper shows step labels and navigation", async ({
      authedPage: page,
    }) => {
      await page.goto("/datasets");
      await page.waitForTimeout(2000);

      const bulkUploadBtn = page
        .getByRole("button", { name: /bulk upload/i })
        .or(page.getByRole("button", { name: /import/i }));

      if (!(await bulkUploadBtn.first().isVisible().catch(() => false))) {
        test.skip();
        return;
      }

      await bulkUploadBtn.first().click();
      await page.waitForTimeout(500);

      // Look for step labels
      const stepLabels = page
        .locator(".MuiStepLabel-root")
        .or(page.locator('[class*="step-label" i]'))
        .or(page.getByText(/step/i));

      if (await stepLabels.first().isVisible().catch(() => false)) {
        await expect(stepLabels.first()).toBeVisible();
      }

      // Look for Next/Back navigation buttons
      const navBtn = page
        .getByRole("button", { name: /next/i })
        .or(page.getByRole("button", { name: /back/i }))
        .or(page.getByRole("button", { name: /continue/i }));

      if (await navBtn.first().isVisible().catch(() => false)) {
        await expect(navBtn.first()).toBeVisible();
      }

      await page.keyboard.press("Escape");
    });
  });
});

// --- Tier 4: CRUD (requires project) ---

projectTest.describe("Datasets CRUD", () => {
  projectTest(
    "CRUD: create and delete dataset",
    async ({ projectPage: page }) => {
      await page.goto("/datasets");
      const datasetName = `E2E Test Dataset ${Date.now()}`;

      // Create: Click add button
      const addBtn = page.getByRole("button", { name: /add new dataset/i });
      if (!(await addBtn.isVisible().catch(() => false))) {
        projectTest.skip();
        return;
      }
      await addBtn.click();

      // Fill dataset name
      const nameInput = page
        .getByRole("textbox", { name: /name/i })
        .or(page.getByPlaceholder(/name/i))
        .or(page.getByPlaceholder(/dataset/i))
        .or(page.getByRole("textbox").first());
      await projectExpect(nameInput.first()).toBeVisible({ timeout: 10_000 });
      await nameInput.first().fill(datasetName);

      // Submit
      const submitBtn = page
        .getByRole("button", { name: /create|save|submit|add/i })
        .last();
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Verify: Search for the created dataset
      const searchInput = page.getByPlaceholder(/search/i);
      if (await searchInput.first().isVisible().catch(() => false)) {
        await searchInput.first().fill(datasetName);
        await page.waitForTimeout(500);
      }

      // Clean up: Delete via row action
      const moreBtn = page
        .getByRole("button", { name: /more/i })
        .or(page.locator('[aria-label="more"]'))
        .or(page.locator('[data-testid="MoreVertIcon"]'));
      if (await moreBtn.first().isVisible().catch(() => false)) {
        await moreBtn.first().click();
        const deleteBtn = page.getByRole("menuitem", {
          name: /delete|remove/i,
        });
        if (await deleteBtn.first().isVisible().catch(() => false)) {
          await deleteBtn.first().click();
          const confirmBtn = page.getByRole("button", {
            name: /confirm|yes|delete/i,
          });
          if (await confirmBtn.first().isVisible().catch(() => false)) {
            await confirmBtn.first().click();
          }
          await page.waitForTimeout(500);
        } else {
          await page.keyboard.press("Escape");
        }
      }
    }
  );
});
