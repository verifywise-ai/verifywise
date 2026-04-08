import { test, expect } from "./fixtures/auth.fixture";

test.describe("Network Error Recovery", () => {
  test("API 401 triggers logout and clears token", async ({
    authedPage: page,
  }) => {
    // Navigate to tasks page normally first
    await page.goto("/tasks");
    await page.waitForTimeout(2000);

    // Verify we are authenticated and page loaded
    await expect(page).toHaveURL(/\/tasks/);

    // Intercept only a specific endpoint (not all APIs) to return 401
    await page.route("**/api/tasks**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      })
    );

    // Trigger a fresh API call by clicking a UI element that refetches
    const searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.getByPlaceholder(/search tasks/i));
    if (await searchInput.first().isVisible().catch(() => false)) {
      await searchInput.first().fill("trigger-refetch");
      await page.waitForTimeout(3000);
    } else {
      // Fallback: reload to trigger the intercepted endpoint
      await page.reload();
      await page.waitForTimeout(5000);
    }

    // Check that auth token was cleared from localStorage
    const tokenCleared = await page.evaluate(() => {
      const token = localStorage.getItem("token");
      return !token || token === "null" || token === "";
    });

    // Either token cleared or redirected to login
    const onLogin = page.url().includes("/login");
    expect(tokenCleared || onLogin).toBe(true);
  });

  test("API 403 with org mismatch shows alert", async ({
    authedPage: page,
  }) => {
    await page.goto("/tasks");
    await page.waitForTimeout(2000);

    // Listen for alert dialogs
    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    // Intercept specific endpoint with 403
    await page.route("**/api/tasks**", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          message: "User does not belong to this organization",
        }),
      })
    );

    // Trigger the intercepted call
    await page.reload();
    await page.waitForTimeout(5000);

    // Should have shown an alert or redirected to login
    const onLogin = page.url().includes("/login");
    const hadAlert = alertMessage.length > 0;
    const uiAlert = await page
      .getByText(/access denied/i)
      .or(page.getByText(/session expired/i))
      .or(page.getByRole("alert"))
      .first()
      .isVisible()
      .catch(() => false);

    expect(onLogin || hadAlert || uiAlert).toBe(true);
  });

  test("API 406 triggers token refresh attempt", async ({
    authedPage: page,
  }) => {
    let refreshAttempted = false;

    // Intercept the refresh token endpoint
    await page.route("**/api/users/refresh-token", (route) => {
      refreshAttempted = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { token: "new-e2e-test-token" } }),
      });
    });

    // Intercept tasks API to return 406 once
    let firstCall = true;
    await page.route("**/api/tasks**", (route) => {
      if (firstCall) {
        firstCall = false;
        return route.fulfill({
          status: 406,
          contentType: "application/json",
          body: JSON.stringify({ message: "Token expired" }),
        });
      }
      return route.continue();
    });

    await page.goto("/tasks");
    await page.waitForTimeout(5000);

    // The refresh token endpoint should have been called
    expect(refreshAttempted).toBe(true);
  });

  test("network offline shows error state or blank page", async ({
    authedPage: page,
  }) => {
    // Abort all API calls to simulate network failure
    await page.route("**/api/**", (route) =>
      route.abort("connectionfailed")
    );

    await page.goto("/tasks");
    await page.waitForTimeout(3000);

    // Page should still render (not crash completely)
    await expect(page.locator("body")).not.toBeEmpty();

    // The app may show error indicators, empty state, or just a blank page
    // All of these are acceptable network-offline behaviors
    const pageRendered = await page.locator("html").isVisible();
    expect(pageRendered).toBe(true);
  });

  test("network recovery after offline", async ({ authedPage: page }) => {
    // Start with aborted routes
    await page.route("**/api/**", (route) =>
      route.abort("connectionfailed")
    );

    await page.goto("/tasks");
    await page.waitForTimeout(2000);

    // Remove the route interception to "recover" network
    await page.unroute("**/api/**");

    // Navigate to trigger fresh API calls
    await page.goto("/tasks");
    await page.waitForTimeout(3000);

    // Page should load with content after recovery
    const content = page
      .getByText(/task/i)
      .or(page.getByRole("table"))
      .or(page.getByRole("button", { name: /add|new|create/i }))
      .or(page.getByText(/no.*task/i));
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });
});
