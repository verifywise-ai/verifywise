import { test as setup, expect } from "@playwright/test";

/**
 * Global setup: logs in once via the real UI and saves browser storage state.
 * All tests that need authentication reuse this state instead of
 * logging in through the UI every time.
 *
 * This uses the actual login flow (not localStorage injection) because
 * the app's version-based cache invalidation in store.ts wipes any
 * manually-set persist:* keys on page load if the version doesn't match.
 */

const TEST_EMAIL = process.env.E2E_EMAIL || "verifywise@email.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "Verifywise#1";
const AUTH_STATE_PATH = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // 1. Login via the real UI
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("name.surname@companyname.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("Enter your password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // 2. Wait for redirect to dashboard (confirms login succeeded)
  // Super-admin users are redirected to /super-admin instead of /
  await expect(page).toHaveURL(/\/(super-admin)?$/, { timeout: 15_000 });

  // 3. Save storage state (localStorage + cookies) for reuse by other tests
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
