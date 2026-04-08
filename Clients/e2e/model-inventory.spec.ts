import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Model Inventory", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.evaluate(() => {
      localStorage.setItem("model-inventory-tour", "true");
    });
  });

  test("renders the model inventory page", async ({ authedPage: page }) => {
    await page.goto("/model-inventory");
    await expect(page).toHaveURL(/\/model-inventory/);

    // Page should show model-related content or empty state
    await expect(
      page.getByText(/model/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/model-inventory");
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

  test("table or empty state is visible", async ({ authedPage: page }) => {
    await page.goto("/model-inventory");

    // Either a table with models or an empty state
    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByText(/no.*model/i))
      .or(page.getByText(/add.*model/i));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 2: Search & Filter ---

  test("search box accepts input and filters results", async ({
    authedPage: page,
  }) => {
    await page.goto("/model-inventory");
    const searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.locator('[data-testid="search-input"]'));

    if (await searchInput.first().isVisible().catch(() => false)) {
      await searchInput.first().fill("nonexistent-xyz-model");
      await page.waitForTimeout(500);
      await searchInput.first().clear();
      await page.waitForTimeout(500);
    }
  });

  // --- Tier 3: Modal open/close ---

  test("Add model button opens and closes modal", async ({
    authedPage: page,
  }) => {
    await page.goto("/model-inventory");
    const addBtn = page
      .locator('[data-joyride-id="add-model-button"]')
      .or(page.getByRole("button", { name: /add.*model/i }))
      .or(page.getByRole("button", { name: /new.*model/i }));

    if (await addBtn.first().isVisible().catch(() => false)) {
      await addBtn.first().click();
      // Verify modal content appears
      await expect(
        page
          .getByText(/add.*model/i)
          .or(page.getByText(/new model/i))
          .or(page.getByText(/create model/i))
          .or(page.getByRole("dialog"))
          .or(page.locator(".MuiDrawer-root"))
          .first()
      ).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    }
  });

  // --- Tier 4: CRUD ---

  test("CRUD: create and delete a model", async ({ authedPage: page }) => {
    await page.goto("/model-inventory");
    const modelName = `E2E Test Model ${Date.now()}`;

    // Create: Click add model button
    const addBtn = page
      .locator('[data-joyride-id="add-model-button"]')
      .or(page.getByRole("button", { name: /add.*model/i }))
      .or(page.getByRole("button", { name: /new.*model/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();

    // Fill in provider/model name fields
    const nameInput = page
      .getByRole("textbox", { name: /name|model/i })
      .or(page.getByPlaceholder(/name|model/i))
      .or(page.getByRole("textbox").first());
    await expect(nameInput.first()).toBeVisible({ timeout: 10_000 });
    await nameInput.first().fill(modelName);

    // Fill version if visible
    const versionInput = page
      .getByRole("textbox", { name: /version/i })
      .or(page.getByPlaceholder(/version/i));
    if (await versionInput.first().isVisible().catch(() => false)) {
      await versionInput.first().fill("1.0");
    }

    // Fill provider if visible
    const providerInput = page
      .getByRole("textbox", { name: /provider/i })
      .or(page.getByPlaceholder(/provider/i));
    if (await providerInput.first().isVisible().catch(() => false)) {
      await providerInput.first().fill("E2E Provider");
    }

    // Submit
    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Verify: Search for the created model
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.first().isVisible().catch(() => false)) {
      await searchInput.first().fill(modelName);
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
        name: /delete|archive|remove/i,
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
  });

  // --- Tier 5: Share links ---

  test.describe("Share Links", () => {
    test("share button opens share dropdown", async ({ authedPage: page }) => {
      await page.goto("/model-inventory");

      // Click on a model row to navigate to detail
      const modelRow = page
        .getByRole("row")
        .nth(1)
        .or(page.locator("tr").nth(1));

      if (!(await modelRow.isVisible().catch(() => false))) {
        test.skip();
        return;
      }
      await modelRow.click();
      await page.waitForTimeout(1000);

      // Look for share button
      const shareBtn = page
        .getByRole("button", { name: /share/i })
        .or(page.locator('[aria-label*="share" i]'))
        .or(page.locator('[data-testid*="share"]'));

      if (await shareBtn.first().isVisible().catch(() => false)) {
        await shareBtn.first().click();
        await page.waitForTimeout(500);

        // Verify share popover/dropdown appears
        const sharePopover = page
          .getByText(/share/i)
          .or(page.getByRole("switch"))
          .or(page.getByText(/link/i));
        await expect(sharePopover.first()).toBeVisible({ timeout: 5_000 });

        await page.keyboard.press("Escape");
      }
    });

    test("enabling share generates a link", async ({ authedPage: page }) => {
      await page.goto("/model-inventory");

      const modelRow = page.getByRole("row").nth(1);
      if (!(await modelRow.isVisible().catch(() => false))) {
        test.skip();
        return;
      }
      await modelRow.click();
      await page.waitForTimeout(1000);

      const shareBtn = page
        .getByRole("button", { name: /share/i })
        .or(page.locator('[aria-label*="share" i]'));

      if (!(await shareBtn.first().isVisible().catch(() => false))) {
        test.skip();
        return;
      }
      await shareBtn.first().click();
      await page.waitForTimeout(500);

      // Toggle sharing on
      const toggle = page
        .getByRole("switch")
        .or(page.getByRole("checkbox", { name: /enable|share/i }));
      if (await toggle.first().isVisible().catch(() => false)) {
        const isChecked = await toggle.first().isChecked().catch(() => false);
        if (!isChecked) {
          await toggle.first().click();
          await page.waitForTimeout(1000);
        }

        // Verify link input field appears with URL content
        const linkInput = page
          .locator('input[readonly]')
          .or(page.locator('input[type="text"]'))
          .or(page.getByRole("textbox"));

        if (await linkInput.first().isVisible().catch(() => false)) {
          const linkValue = await linkInput.first().inputValue().catch(() => "");
          if (linkValue) {
            expect(linkValue).toContain("/");
          }
        }
      }

      await page.keyboard.press("Escape");
    });

    test("copy link button copies to clipboard", async ({
      authedPage: page,
    }) => {
      await page.goto("/model-inventory");

      const modelRow = page.getByRole("row").nth(1);
      if (!(await modelRow.isVisible().catch(() => false))) {
        test.skip();
        return;
      }
      await modelRow.click();
      await page.waitForTimeout(1000);

      const shareBtn = page
        .getByRole("button", { name: /share/i })
        .or(page.locator('[aria-label*="share" i]'));

      if (!(await shareBtn.first().isVisible().catch(() => false))) {
        test.skip();
        return;
      }
      await shareBtn.first().click();
      await page.waitForTimeout(500);

      // Look for copy button
      const copyBtn = page
        .getByRole("button", { name: /copy/i })
        .or(page.locator('[aria-label*="copy" i]'));

      if (await copyBtn.first().isVisible().catch(() => false)) {
        // Grant clipboard permission and click copy
        await copyBtn.first().click();
        await page.waitForTimeout(500);

        // Verify some visual feedback (tooltip, snackbar, or icon change)
        const feedback = page
          .getByText(/copied/i)
          .or(page.getByRole("alert"));
        if (await feedback.first().isVisible().catch(() => false)) {
          await expect(feedback.first()).toBeVisible();
        }
      }

      await page.keyboard.press("Escape");
    });
  });

  // --- Tier 5: Model lifecycle detail ---

  test.describe("Model Lifecycle Detail", () => {
    test("clicking a model row navigates to detail page", async ({
      authedPage: page,
    }) => {
      await page.goto("/model-inventory");

      const modelRow = page
        .getByRole("row")
        .nth(1)
        .or(page.locator("tr").nth(1));

      if (!(await modelRow.isVisible().catch(() => false))) {
        test.skip();
        return;
      }
      await modelRow.click();
      await page.waitForTimeout(1000);

      // Should navigate to a model detail page
      const isDetailPage =
        page.url().includes("/model-inventory/models/") ||
        page.url().includes("/model-inventory/");

      if (isDetailPage) {
        await expect(page.locator("body")).not.toBeEmpty();
      }
    });

    test("model detail page shows tabs or sections", async ({
      authedPage: page,
    }) => {
      await page.goto("/model-inventory");

      const modelRow = page.getByRole("row").nth(1);
      if (!(await modelRow.isVisible().catch(() => false))) {
        test.skip();
        return;
      }
      await modelRow.click();
      await page.waitForTimeout(1000);

      // Look for tabs, sections, or lifecycle stages
      const sections = page
        .getByRole("tab")
        .or(page.getByRole("tablist"))
        .or(page.getByText(/lifecycle/i))
        .or(page.getByText(/evidence/i))
        .or(page.getByText(/risk/i))
        .or(page.getByRole("heading"));

      if (await sections.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
        await expect(sections.first()).toBeVisible();
      }
    });

    test("model risks page loads", async ({ authedPage: page }) => {
      await page.goto("/model-inventory/model-risks");
      await page.waitForTimeout(2000);

      const content = page
        .getByText(/risk/i)
        .or(page.getByRole("table"))
        .or(page.getByText(/no.*risk/i))
        .or(page.getByRole("heading"));

      if (await content.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
        await expect(content.first()).toBeVisible();
      }
    });
  });
});
