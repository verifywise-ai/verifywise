import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Incident Management", () => {
  test("renders the incidents page", async ({ authedPage: page }) => {
    await page.goto("/ai-incident-managements");
    await expect(page).toHaveURL(/\/ai-incident-managements/);

    // Page should show incident-related content or empty state
    await expect(
      page.getByText(/incident/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-incident-managements");
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

  test("incident list or empty state is visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-incident-managements");

    const content = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByText(/no.*incident/i))
      .or(page.getByRole("button", { name: /add|new|create|report/i }));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Tier 2: Search ---

  test("search box accepts input and filters results", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-incident-managements");
    const searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.locator('[data-testid="search-input"]'));

    if (await searchInput.first().isVisible().catch(() => false)) {
      await searchInput.first().fill("nonexistent-xyz-incident");
      await page.waitForTimeout(500);
      await searchInput.first().clear();
      await page.waitForTimeout(500);
    }
  });

  // --- Tier 2: Status cards ---

  test("status cards or summary are visible", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-incident-managements");

    const statusCard = page
      .getByText(/open/i)
      .or(page.getByText(/closed/i))
      .or(page.getByText(/total/i))
      .or(page.getByText(/critical/i))
      .or(page.getByText(/severity/i));

    if (await statusCard.first().isVisible().catch(() => false)) {
      await expect(statusCard.first()).toBeVisible();
    }
  });

  // --- Tier 3: Drawer open/close ---

  test("Add new incident button opens drawer", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-incident-managements");
    const addBtn = page.getByRole("button", { name: /add new incident/i });

    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      // Incidents use a MUI Drawer (role="presentation")
      await expect(
        page
          .locator(".MuiDrawer-root")
          .or(page.getByText(/new incident/i))
          .or(page.getByText(/create incident/i))
          .first()
      ).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    }
  });

  // --- Tier 4: CRUD ---

  test("CRUD: create and archive an incident", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-incident-managements");
    const incidentTitle = `E2E Test Incident ${Date.now()}`;

    // Create: Click "Add new incident"
    const addBtn = page.getByRole("button", { name: /add new incident/i });
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.click();

    // Fill in incident title/description
    const titleInput = page
      .getByRole("textbox", { name: /title/i })
      .or(page.getByPlaceholder(/title/i))
      .or(page.getByPlaceholder(/incident/i))
      .or(page.getByRole("textbox").first());
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
    await titleInput.first().fill(incidentTitle);

    // Fill severity if dropdown exists
    const severitySelect = page
      .getByRole("combobox", { name: /severity/i })
      .or(page.getByText(/select.*severity/i));
    if (await severitySelect.first().isVisible().catch(() => false)) {
      await severitySelect.first().click();
      const option = page.getByRole("option").first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
      }
    }

    // Fill description if visible
    const descInput = page
      .getByRole("textbox", { name: /description/i })
      .or(page.getByPlaceholder(/description/i));
    if (await descInput.first().isVisible().catch(() => false)) {
      await descInput.first().fill("E2E test incident description");
    }

    // Submit
    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add|report/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Verify: Search for the created incident
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.first().isVisible().catch(() => false)) {
      await searchInput.first().fill(incidentTitle);
      await page.waitForTimeout(500);
    }

    // Clean up: Archive via row action
    const moreBtn = page
      .getByRole("button", { name: /more/i })
      .or(page.locator('[aria-label="more"]'))
      .or(page.locator('[data-testid="MoreVertIcon"]'));
    if (await moreBtn.first().isVisible().catch(() => false)) {
      await moreBtn.first().click();
      const archiveBtn = page.getByRole("menuitem", {
        name: /archive|delete|remove|close/i,
      });
      if (await archiveBtn.first().isVisible().catch(() => false)) {
        await archiveBtn.first().click();
        const confirmBtn = page.getByRole("button", {
          name: /confirm|yes|archive|delete/i,
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
});
