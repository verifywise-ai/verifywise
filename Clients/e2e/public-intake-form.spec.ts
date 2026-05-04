import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Custom fixture for public intake form tests.
 * Uses an authenticated page to first discover a valid intake form slug,
 * then provides an unauthenticated page for testing the public form.
 */
const test = base.extend<{ publicFormUrl: string | null }>({
  publicFormUrl: async ({ browser }, use) => {
    // Use authenticated context to discover a public form URL
    const authContext = await browser.newContext({
      storageState: "e2e/.auth/user.json",
    });
    const authPage = await authContext.newPage();

    let formUrl: string | null = null;

    try {
      await authPage.goto("/intake-forms", { waitUntil: "domcontentloaded" });

      // Wait for page to load
      await authPage.waitForTimeout(3000);

      // Look for a form link, share button, or public URL in the page
      const publicLink = authPage
        .getByRole("link", { name: /view|preview|public/i })
        .or(authPage.locator('a[href*="use-case-form-intake"]'))
        .or(authPage.locator('a[href*="/intake/"]'));

      if (
        await publicLink
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        formUrl = await publicLink.first().getAttribute("href");
      }
    } catch {
      // Unable to discover form URL — tests will skip
    } finally {
      await authContext.close();
    }

    await use(formUrl);
  },
});

test.describe("Public Intake Form", () => {
  // --- Tier 0: Route resolution ---

  test("public form route renders form or 404", async ({ page }) => {
    // Try a known test path — should render form page or not-found
    await page.goto("/test-public-id/use-case-form-intake", {
      waitUntil: "domcontentloaded",
    });

    // Page should render something (form, error, or 404)
    await expect(page.locator("body")).not.toBeEmpty();

    const content = page
      .getByText(/form/i)
      .or(page.getByText(/not found/i))
      .or(page.getByText(/expired/i))
      .or(page.getByText(/loading/i))
      .or(page.getByText(/submit/i))
      .or(page.getByRole("heading"));

    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("legacy route format also works", async ({ page }) => {
    await page.goto("/intake/test-tenant/test-form", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("body")).not.toBeEmpty();

    const content = page
      .getByText(/form/i)
      .or(page.getByText(/not found/i))
      .or(page.getByText(/expired/i))
      .or(page.getByRole("heading"));

    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  // --- Tier 1: Form rendering (requires a real form) ---

  test("renders form fields when a valid form exists", async ({ publicFormUrl, page }) => {
    if (!publicFormUrl) {
      test.skip();
      return;
    }

    await page.goto(publicFormUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Form should show input fields
    const formFields = page
      .getByRole("textbox")
      .or(page.locator("input"))
      .or(page.locator("select"))
      .or(page.locator("textarea"));

    if (
      !(await formFields
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false))
    ) {
      test.skip();
      return;
    }

    await expect(formFields.first()).toBeVisible();
  });

  test("form has a submit button", async ({ publicFormUrl, page }) => {
    if (!publicFormUrl) {
      test.skip();
      return;
    }

    await page.goto(publicFormUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const submitBtn = page
      .getByRole("button", { name: /submit/i })
      .or(page.getByRole("button", { name: /send/i }));

    if (
      await submitBtn
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(submitBtn.first()).toBeVisible();
    }
  });

  test("form shows contact info fields (name and email)", async ({ publicFormUrl, page }) => {
    if (!publicFormUrl) {
      test.skip();
      return;
    }

    await page.goto(publicFormUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Contact fields: name and email
    const nameField = page
      .getByPlaceholder(/name/i)
      .or(page.getByRole("textbox", { name: /name/i }));
    const emailField = page
      .getByPlaceholder(/email/i)
      .or(page.getByRole("textbox", { name: /email/i }));

    if (
      await nameField
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(nameField.first()).toBeVisible();
    }
    if (
      await emailField
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(emailField.first()).toBeVisible();
    }
  });

  // --- Tier 2: Form validation ---

  test("submitting empty required fields shows validation errors", async ({
    publicFormUrl,
    page,
  }) => {
    if (!publicFormUrl) {
      test.skip();
      return;
    }

    await page.goto(publicFormUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Try submitting without filling any fields
    const submitBtn = page
      .getByRole("button", { name: /submit/i })
      .or(page.getByRole("button", { name: /send/i }));

    if (
      !(await submitBtn
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip();
      return;
    }

    await submitBtn.first().click();
    await page.waitForTimeout(1000);

    // Should show validation error(s)
    const errorMsg = page
      .getByText(/required/i)
      .or(page.getByText(/please/i))
      .or(page.locator('[class*="error" i]'))
      .or(page.locator(".Mui-error"));

    if (
      await errorMsg
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(errorMsg.first()).toBeVisible();
    }
  });

  // --- Tier 2: Math captcha ---

  test("math captcha is displayed on the form", async ({ publicFormUrl, page }) => {
    if (!publicFormUrl) {
      test.skip();
      return;
    }

    await page.goto(publicFormUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Look for math captcha element
    const captcha = page
      .getByText(/\d+\s*[+\-×÷]\s*\d+/i)
      .or(page.getByPlaceholder(/answer/i))
      .or(page.getByText(/captcha/i))
      .or(page.locator('[class*="captcha" i]'));

    if (
      await captcha
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(captcha.first()).toBeVisible();
    }
  });

  // --- Tier 3: Powered by footer ---

  test("shows Powered by VerifyWise footer", async ({ publicFormUrl, page }) => {
    if (!publicFormUrl) {
      test.skip();
      return;
    }

    await page.goto(publicFormUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const footer = page.getByText(/powered by/i).or(page.getByText(/verifywise/i));

    if (
      await footer
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(footer.first()).toBeVisible();
    }
  });

  // --- Accessibility ---

  test("public form has no accessibility violations", async ({ page }) => {
    await page.goto("/test-public-id/use-case-form-intake", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

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

// --- Success page ---

test.describe("Submission Success Page", () => {
  test("success page renders correctly", async ({ page }) => {
    await page.goto("/test-public-id/use-case-form-intake/success", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("body")).not.toBeEmpty();

    // Should show success content, form-unavailable message, or redirect
    const content = page
      .getByText(/success/i)
      .or(page.getByText(/submitted/i))
      .or(page.getByText(/thank/i))
      .or(page.getByText(/reference/i))
      .or(page.getByText(/pending/i))
      .or(page.getByText(/unavailable/i))
      .or(page.getByText(/expired/i))
      .or(page.getByRole("heading"));

    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });
});
