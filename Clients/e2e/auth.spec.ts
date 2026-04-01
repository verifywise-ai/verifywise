import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TEST_EMAIL = process.env.E2E_EMAIL || "verifywise@email.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "Verifywise#1";

test.describe("Authentication", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("Log in to your account")).toBeVisible();
    await expect(
      page.getByPlaceholder("name.surname@companyname.com")
    ).toBeVisible();
    await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("redirects to /login when accessing protected route without auth", async ({
    page,
  }) => {
    await page.goto("/vendors");
    await expect(page).toHaveURL(/\/login/);
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");

    await page
      .getByPlaceholder("name.surname@companyname.com")
      .fill(TEST_EMAIL);
    await page.getByPlaceholder("Enter your password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to the dashboard
    await expect(page).toHaveURL("/", { timeout: 15_000 });
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page
      .getByPlaceholder("name.surname@companyname.com")
      .fill("bad@email.com");
    await page.getByPlaceholder("Enter your password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // An error alert should appear
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  });

  test("forgot password link navigates correctly", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Forgot password").click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("register link navigates correctly", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Register here").click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("login page has no accessibility violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  // --- Logout ---

  test("logout redirects to login page", async ({ page }) => {
    // Login first via UI
    await page.goto("/login");
    await page
      .getByPlaceholder("name.surname@companyname.com")
      .fill(TEST_EMAIL);
    await page.getByPlaceholder("Enter your password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    // Dismiss "Welcome to VerifyWise" dialog if it appears.
    // Note: locator.isVisible() does NOT auto-wait, use expect with try/catch.
    const welcomeSkip = page.getByRole("button", { name: /skip for now/i });
    try {
      await expect(welcomeSkip).toBeVisible({ timeout: 5_000 });
      await welcomeSkip.click();
      await page.waitForTimeout(1000);
    } catch {
      // Dialog didn't appear — continue
    }

    // The sidebar footer has a MoreVertical icon button (no accessible name)
    // next to the user name/role. Navigate from "Admin" text up to the
    // user footer container and find the button sibling.
    const adminLabel = page.getByText("Admin", { exact: true });
    await expect(adminLabel.first()).toBeVisible({ timeout: 10_000 });
    // Admin text → parent (name+role container) → grandparent (user footer) → button
    const moreBtn = adminLabel.first().locator("xpath=../../button");
    await expect(moreBtn.first()).toBeVisible({ timeout: 5_000 });
    await moreBtn.first().click();
    await page.waitForTimeout(1000);

    // Click "Logout" in the drawer that appears
    const logoutBtn = page.getByText("Logout", { exact: true });
    await expect(logoutBtn.first()).toBeVisible({ timeout: 5_000 });
    await logoutBtn.first().click();

    // Verify redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  // --- Registration form ---

  test("registration page renders form fields", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("domcontentloaded");

    // Verify registration form fields are present
    const nameField = page.getByPlaceholder("Your name");
    const surnameField = page.getByPlaceholder("Your surname");
    const emailField = page.getByPlaceholder("name.surname@companyname.com");
    const passwordField = page.getByPlaceholder("Create a password");
    const confirmField = page.getByPlaceholder("Confirm your password");

    await expect(nameField).toBeVisible({ timeout: 10_000 });
    await expect(surnameField).toBeVisible({ timeout: 10_000 });
    await expect(emailField).toBeVisible({ timeout: 10_000 });
    await expect(passwordField).toBeVisible({ timeout: 10_000 });
    await expect(confirmField).toBeVisible({ timeout: 10_000 });
  });

  test("registration form shows validation on empty submit", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.waitForLoadState("domcontentloaded");

    // The "Get started" button should be present
    const submitBtn = page.getByRole("button", { name: /get started/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });

    // Click submit without filling any fields
    await submitBtn.click();
    await page.waitForTimeout(500);

    // Verify validation errors appear (required field messages or HTML5 :invalid)
    const error = page
      .getByText(/required/i)
      .or(page.getByText(/please/i))
      .or(page.getByText(/invalid/i))
      .or(page.locator(".Mui-error"))
      .or(page.getByRole("alert"));
    await expect(error.first()).toBeVisible({ timeout: 5_000 });
  });

  // --- Password reset form ---

  test("forgot password page renders form", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("domcontentloaded");

    // Verify email field and submit button
    const emailField = page
      .getByPlaceholder(/email/i)
      .or(page.getByRole("textbox", { name: /email/i }))
      .or(page.getByRole("textbox").first());
    const submitBtn = page
      .getByRole("button", { name: /send|reset|submit/i });

    await expect(emailField.first()).toBeVisible({ timeout: 10_000 });
    await expect(submitBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("forgot password button is disabled when email is empty", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("domcontentloaded");

    // The "Reset password" button should be disabled when email is empty
    const submitBtn = page.getByRole("button", { name: /reset password/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await expect(submitBtn).toBeDisabled();

    // Fill email to verify button becomes enabled
    const emailField = page.getByPlaceholder("Enter your email");
    await emailField.fill("test@example.com");
    await page.waitForTimeout(500);

    await expect(submitBtn).toBeEnabled();
  });
});
