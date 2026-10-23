import { test, expect } from "../fixtures/auth.fixture";

/**
 * Playwright canary spec — minimal critical journey.
 *
 * Issue #4681-a: a fast, deterministic smoke test intended to run on a
 * schedule (GitHub Actions workflow, wired by the orchestrator pod) against
 * staging / production via the E2E_BASE_URL env var.
 *
 *   cd Clients
 *   E2E_BASE_URL=https://staging.verifywise.com npx playwright test \
 *     --project=canary --grep @canary
 *
 * Journey covered (kept intentionally tiny so it finishes in seconds):
 *   1. Authenticated session is restored from storage state (global.setup).
 *   2. Dashboard (/) renders.
 *   3. Project list on /overview loads (table, grid, cards, or the seeded
 *      baseline project entry).
 */

test.describe("@canary critical journey", () => {
  test("login → dashboard renders → project list loads @canary", async ({ authedPage: page }) => {
    // --- 1. Auth state: authedPage navigates to "/" and waits for auth ---
    // If the stored session is invalid we land back on /login — fail fast.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    // --- 2. Dashboard renders ---
    await expect(page.locator("body")).not.toBeEmpty();
    const dashboardContent = page
      .getByRole("heading")
      .or(page.locator(".MuiCard-root"))
      .or(page.getByText(/overview|dashboard|welcome/i));
    await expect(dashboardContent.first()).toBeVisible({ timeout: 15_000 });

    // --- 3. Project list loads ---
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 });

    const projectList = page
      .getByRole("table")
      .or(page.getByRole("grid"))
      .or(page.getByRole("list"))
      .or(page.locator('[class*="card" i]'))
      .or(page.getByText(/e2e baseline project/i)); // seeded by global.setup
    await expect(projectList.first()).toBeVisible({ timeout: 15_000 });
  });
});
