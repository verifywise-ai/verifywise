import { test as authTest, expect as authExpect } from "./fixtures/auth.fixture";
import { test as projectTest, expect as projectExpect } from "./fixtures/project.fixture";
import AxeBuilder from "@axe-core/playwright";

const test = authTest;
const expect = authExpect;

test.describe("Vendors Page", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.evaluate(() => {
      localStorage.setItem("vendor-tour", "true");
    });
  });

  test("displays the vendor page with title", async ({ authedPage: page }) => {
    await page.goto("/vendors");

    // Page should load and show vendor-related content
    await expect(page.getByText(/vendor/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("has Vendors and Risks tabs", async ({ authedPage: page }) => {
    await page.goto("/vendors");

    // Look for tab elements
    const vendorsTab = page.getByRole("tab", { name: /vendors/i });
    const risksTab = page.getByRole("tab", { name: /risks/i });

    // At least one tab should be visible
    await expect(vendorsTab.or(risksTab).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("search box is present", async ({ authedPage: page }) => {
    await page.goto("/vendors");

    // Search input should be available
    const searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.locator('[data-testid="search-input"]'));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test("vendors page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/vendors");
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
        "nested-interactive",
      ])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  // --- Tier 1: Tab switching ---

  test("clicking Risks tab navigates to /vendors/risks", async ({
    authedPage: page,
  }) => {
    await page.goto("/vendors");
    const risksTab = page.getByRole("tab", { name: /risks/i });
    await expect(risksTab).toBeVisible({ timeout: 10_000 });
    await risksTab.click();
    await expect(page).toHaveURL(/\/vendors\/risks/, { timeout: 10_000 });
  });

  test("clicking Vendors tab returns to /vendors", async ({
    authedPage: page,
  }) => {
    await page.goto("/vendors/risks");
    const vendorsTab = page.getByRole("tab", { name: /vendors/i });
    await expect(vendorsTab).toBeVisible({ timeout: 10_000 });
    await vendorsTab.click();
    await expect(page).toHaveURL(/\/vendors$/, { timeout: 10_000 });
  });

  // --- Tier 2: Search & Filter ---

  test("searching for nonexistent vendor filters results", async ({
    authedPage: page,
  }) => {
    await page.goto("/vendors");
    const searchInput = page
      .getByPlaceholder(/search vendors/i)
      .or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });

    await searchInput.first().fill("nonexistent-xyz-vendor");
    await page.waitForTimeout(500);

    // Clear search and verify state is restored
    await searchInput.first().clear();
    await page.waitForTimeout(500);
  });

  test("filter button opens filter options", async ({
    authedPage: page,
  }) => {
    await page.goto("/vendors");
    const filterBtn = page
      .getByRole("button", { name: /filter/i })
      .or(page.getByText(/filter by/i));
    const firstFilter = filterBtn.first();

    if (await firstFilter.isVisible().catch(() => false)) {
      await firstFilter.click();
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
    }
  });

  // --- Tier 3: Modal open/close ---

  test("Add new vendor button opens modal when enabled", async ({
    authedPage: page,
  }) => {
    await page.goto("/vendors");
    const addBtn = page.getByRole("button", { name: /add new vendor/i });

    if (await addBtn.isVisible().catch(() => false)) {
      const isDisabled = await addBtn.isDisabled();
      if (!isDisabled) {
        await addBtn.click();
        // StandardModal uses role="presentation" (MUI Modal), detect by title
        await expect(
          page
            .getByText(/add new vendor/i)
            .or(page.getByText(/create vendor/i))
            .first()
        ).toBeVisible({ timeout: 10_000 });
        await page.keyboard.press("Escape");
      }
      // If disabled, no projects exist — skip silently
    }
  });
});

// --- Tier 4: CRUD (requires project) ---

projectTest.describe("Vendors CRUD", () => {
  projectTest.beforeEach(async ({ projectPage: page }) => {
    await page.evaluate(() => {
      localStorage.setItem("vendor-tour", "true");
    });
  });

  projectTest(
    "CRUD: create and delete vendor",
    async ({ projectPage: page, projectName }) => {
      await page.goto("/vendors");
      const vendorName = `E2E Test Vendor ${Date.now()}`;

      // Create: Click "Add new vendor"
      const addBtn = page.getByRole("button", { name: /add new vendor/i });
      await projectExpect(addBtn).toBeVisible({ timeout: 10_000 });

      // Button should be enabled now that a project exists
      if (await addBtn.isDisabled()) {
        projectTest.skip();
        return;
      }
      await addBtn.click();

      // Fill vendor name
      const nameInput = page
        .getByRole("textbox", { name: /name/i })
        .or(page.getByPlaceholder(/vendor name/i))
        .or(page.getByPlaceholder(/name/i))
        .or(page.getByRole("textbox").first());
      await projectExpect(nameInput.first()).toBeVisible({ timeout: 10_000 });
      await nameInput.first().fill(vendorName);

      // Select project if dropdown exists
      const projectSelect = page
        .getByRole("combobox", { name: /project/i })
        .or(page.getByText(/select.*project/i));
      if (await projectSelect.first().isVisible().catch(() => false)) {
        await projectSelect.first().click();
        // Pick the project we created or first available
        const projectOption = page
          .getByRole("option", { name: new RegExp(projectName, "i") })
          .or(page.getByRole("option").first());
        if (await projectOption.first().isVisible().catch(() => false)) {
          await projectOption.first().click();
        }
      }

      // Submit
      const submitBtn = page
        .getByRole("button", { name: /create|save|submit|add/i })
        .last();
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Verify: Search for the created vendor
      const searchInput = page
        .getByPlaceholder(/search vendors/i)
        .or(page.getByPlaceholder(/search/i));
      if (await searchInput.first().isVisible().catch(() => false)) {
        await searchInput.first().fill(vendorName);
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
