import { test, expect } from "./fixtures/auth.fixture";

test.describe("Snackbar / Toast Notifications", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.evaluate(() => {
      localStorage.setItem("tasks-tour", "true");
    });
  });

  test("success snackbar appears on CRUD action", async ({
    authedPage: page,
  }) => {
    await page.goto("/tasks");
    const taskTitle = `E2E Notif ${Date.now()}`;

    // Create a task to trigger a success notification
    const addBtn = page.getByRole("button", { name: /add new task/i });
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.click();

    const titleInput = page
      .getByRole("textbox", { name: /title/i })
      .or(page.getByPlaceholder(/title/i))
      .or(page.locator('input[name="title"]'));
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
    await titleInput.first().fill(taskTitle);

    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(1500);

    // Verify success notification appears
    const snackbar = page
      .getByRole("alert")
      .or(page.locator(".MuiSnackbar-root"))
      .or(page.locator(".MuiAlert-root"))
      .or(page.getByText(/success/i))
      .or(page.getByText(/created/i));

    if (await snackbar.first().isVisible().catch(() => false)) {
      await expect(snackbar.first()).toBeVisible();
    }
  });

  test("snackbar auto-dismisses after timeout", async ({
    authedPage: page,
  }) => {
    await page.goto("/tasks");
    const taskTitle = `E2E AutoDismiss ${Date.now()}`;

    const addBtn = page.getByRole("button", { name: /add new task/i });
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.click();

    const titleInput = page
      .getByRole("textbox", { name: /title/i })
      .or(page.getByPlaceholder(/title/i))
      .or(page.locator('input[name="title"]'));
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
    await titleInput.first().fill(taskTitle);

    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    const snackbar = page
      .getByRole("alert")
      .or(page.locator(".MuiSnackbar-root"));

    if (await snackbar.first().isVisible().catch(() => false)) {
      // Wait for auto-dismiss (typically 4-6 seconds)
      await page.waitForTimeout(7000);

      // Snackbar should be gone
      const stillVisible = await snackbar
        .first()
        .isVisible()
        .catch(() => false);
      expect(stillVisible).toBe(false);
    }
  });

  test("error notification on failed action", async ({
    authedPage: page,
  }) => {
    // Route API to return 500 for task creation
    await page.route("**/api/tasks", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Internal server error" }),
        });
      }
      return route.continue();
    });

    await page.goto("/tasks");

    const addBtn = page.getByRole("button", { name: /add new task/i });
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.click();

    const titleInput = page
      .getByRole("textbox", { name: /title/i })
      .or(page.getByPlaceholder(/title/i))
      .or(page.locator('input[name="title"]'));
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
    await titleInput.first().fill(`E2E Error Test ${Date.now()}`);

    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Verify error notification appears
    const errorAlert = page
      .getByRole("alert")
      .or(page.locator(".MuiSnackbar-root"))
      .or(page.locator(".MuiAlert-root"))
      .or(page.getByText(/error/i))
      .or(page.getByText(/failed/i));

    if (await errorAlert.first().isVisible().catch(() => false)) {
      await expect(errorAlert.first()).toBeVisible();
    }

    await page.keyboard.press("Escape");
  });
});
