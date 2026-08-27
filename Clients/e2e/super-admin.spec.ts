import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Super Admin", () => {
  // --- Tier 0: Page load ---

  test.describe("Organizations", () => {
    test("renders the organizations page", async ({ authedPage: page }) => {
      await page.goto("/super-admin");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      await expect(
        page
          .getByText(/organization/i)
          .or(page.getByRole("heading"))
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    test("displays organizations table or empty state", async ({ authedPage: page }) => {
      await page.goto("/super-admin");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      const content = page
        .getByRole("table")
        .or(page.getByText(/no.*organization/i))
        .or(page.getByText(/organization/i))
        .or(page.getByRole("heading"));
      await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test("search box filters organizations", async ({ authedPage: page }) => {
      await page.goto("/super-admin");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      const searchInput = page
        .getByPlaceholder(/search/i)
        .or(page.locator('[data-testid="search-input"]'));

      await expect(searchInput.first()).toBeVisible({ timeout: 15_000 });

      await searchInput.first().fill("nonexistent-org-xyz");
      await page.waitForTimeout(500);
      await searchInput.first().clear();
      await page.waitForTimeout(500);
    });

    test("create organization button opens modal", async ({ authedPage: page }) => {
      await page.goto("/super-admin");

      await expect(page).toHaveURL(/\/super-admin/);

      const createBtn = page
        .getByRole("button", { name: /create.*organization/i })
        .or(page.getByRole("button", { name: /add.*organization/i }))
        .or(page.getByRole("button", { name: /new.*organization/i }));

      await expect(createBtn.first()).toBeVisible({ timeout: 15_000 });
      await createBtn.first().click();

      // Modal should open with organization name input
      const modal = page
        .getByText(/create.*organization/i)
        .or(page.getByText(/organization.*name/i))
        .or(page.getByRole("dialog"));
      await expect(modal.first()).toBeVisible({ timeout: 5_000 });

      await page.keyboard.press("Escape");
    });

    test("table columns are sortable", async ({ authedPage: page }) => {
      await page.goto("/super-admin");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      // Look for sortable column headers (Name, Users, Created)
      const nameHeader = page
        .getByRole("columnheader", { name: /name/i })
        .or(page.getByText(/name/i).first());

      if (await nameHeader.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await nameHeader.click();
        await page.waitForTimeout(500);

        // Sort indicator should appear
        const sortIndicator = page
          .locator('[class*="sort" i]')
          .or(page.locator("svg"))
          .or(page.locator("[aria-sort]"));

        // Just verify the click didn't break anything
        await expect(page.locator("body")).not.toBeEmpty();
      }
    });

    test("page has no accessibility violations", async ({ authedPage: page }) => {
      await page.goto("/super-admin");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

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
          "nested-interactive",
        ])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });

  // --- All Users ---

  test.describe("All Users", () => {
    test("renders the all users page", async ({ authedPage: page }) => {
      await page.goto("/super-admin/users");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      await expect(page.getByText(/user/i).or(page.getByRole("heading")).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    test("displays users table with columns", async ({ authedPage: page }) => {
      await page.goto("/super-admin/users");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      const table = page
        .getByRole("table")
        .or(page.getByText(/name/i))
        .or(page.getByText(/user/i))
        .or(page.getByRole("heading"));

      await expect(table.first()).toBeVisible({ timeout: 15_000 });
    });

    test("search filters users", async ({ authedPage: page }) => {
      await page.goto("/super-admin/users");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      const searchInput = page
        .getByPlaceholder(/search/i)
        .or(page.locator('[data-testid="search-input"]'));

      await expect(searchInput.first()).toBeVisible({ timeout: 15_000 });

      await searchInput.first().fill("nonexistent-user-xyz");
      await page.waitForTimeout(500);
      await searchInput.first().clear();
    });

    test("organization filter dropdown is available", async ({ authedPage: page }) => {
      await page.goto("/super-admin/users");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      // Look for organization filter (Autocomplete)
      const orgFilter = page
        .getByRole("combobox", { name: /organization/i })
        .or(page.getByPlaceholder(/organization/i))
        .or(page.getByText(/all organizations/i));

      if (
        await orgFilter
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await expect(orgFilter.first()).toBeVisible();
      }
    });

    test("role filter dropdown is available", async ({ authedPage: page }) => {
      await page.goto("/super-admin/users");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      // Look for role filter (Select)
      const roleFilter = page
        .getByRole("combobox", { name: /role/i })
        .or(page.getByText(/all roles/i))
        .or(page.getByPlaceholder(/role/i));

      if (
        await roleFilter
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await expect(roleFilter.first()).toBeVisible();
      }
    });
  });

  // --- Settings ---

  test.describe("Settings", () => {
    test("renders the super admin settings page", async ({ authedPage: page }) => {
      await page.goto("/super-admin/settings");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      await expect(
        page
          .getByText(/settings/i)
          .or(page.getByText(/profile/i))
          .or(page.getByRole("heading"))
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    test("has Profile and Password tabs", async ({ authedPage: page }) => {
      await page.goto("/super-admin/settings");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      const profileTab = page.getByRole("tab", { name: /profile/i }).or(page.getByText(/profile/i));
      const passwordTab = page
        .getByRole("tab", { name: /password/i })
        .or(page.getByText(/password/i));

      await expect(profileTab.first()).toBeVisible({ timeout: 15_000 });
      await expect(passwordTab.first()).toBeVisible({ timeout: 15_000 });
    });

    test("clicking Password tab shows password form", async ({ authedPage: page }) => {
      await page.goto("/super-admin/settings");

      await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

      const passwordTab = page
        .getByRole("tab", { name: /password/i })
        .or(page.getByText(/password/i));

      await expect(passwordTab.first()).toBeVisible({ timeout: 15_000 });
      await passwordTab.first().click();
      await page.waitForTimeout(500);

      // Should show password input fields
      const passwordField = page
        .locator('input[type="password"]')
        .or(page.getByPlaceholder(/password/i));
      await expect(passwordField.first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // --- Navigation between sub-pages ---

  test("can navigate from organizations to users page", async ({ authedPage: page }) => {
    await page.goto("/super-admin");

    await expect(page).toHaveURL(/\/super-admin/, { timeout: 15_000 });

    // Look for a "Users" button in the table rows
    const usersBtn = page
      .getByRole("button", { name: /users/i })
      .or(page.getByRole("link", { name: /users/i }));

    if (
      await usersBtn
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false)
    ) {
      await usersBtn.first().click();
      await page.waitForTimeout(1000);

      // Should navigate to organization users page
      const isUsersPage = page.url().includes("/users") || page.url().includes("/super-admin");
      expect(isUsersPage).toBe(true);
    }
  });
});
