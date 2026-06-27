import { test, expect } from "./fixtures/project.fixture";

test.describe("Critical end-to-end journey", () => {
  test("login as super-admin → create organization → create project → add risk → open Tasks → verify Deadline Warning banner", async ({
    projectPage: page,
    projectName,
  }) => {
    // The setup has already logged in as super-admin, created an organization,
    // seeded an admin user, and logged in as that admin. The project fixture
    // has created a project, so we continue by adding a risk.

    const riskTitle = `E2E Critical Risk ${Date.now()}`;
    const taskTitle = `E2E Critical Task ${Date.now()}`;

    // --- Add a risk ---
    await page.goto("/risk-management");
    await expect(page).toHaveURL(/\/risk-management/);

    await page.evaluate(() => {
      localStorage.setItem("risk-management-tour", "true");
    });

    const addRiskBtn = page.getByRole("button", { name: /add new risk/i });
    await expect(addRiskBtn).toBeVisible({ timeout: 15_000 });
    await addRiskBtn.click();
    await page.waitForTimeout(300);

    const manualOption = page
      .getByText(/add manually/i)
      .or(page.getByText(/custom risk/i))
      .or(page.getByText(/add a new risk/i));
    if (await manualOption.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await manualOption.first().click();
    }

    const riskTitleInput = page
      .getByRole("textbox", { name: /title/i })
      .or(page.getByPlaceholder(/title/i))
      .or(page.getByPlaceholder(/risk name/i))
      .or(page.getByRole("textbox").first());
    await expect(riskTitleInput.first()).toBeVisible({ timeout: 10_000 });
    await riskTitleInput.first().fill(riskTitle);

    const projectSelect = page
      .getByRole("combobox", { name: /project/i })
      .or(page.getByText(/select.*project/i));
    if (await projectSelect.first().isVisible().catch(() => false)) {
      await projectSelect.first().click();
      const projectOption = page.getByRole("option", { name: new RegExp(projectName, "i") });
      if (await projectOption.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await projectOption.first().click();
      }
    }

    const submitRiskBtn = page.getByRole("button", { name: /create|save|submit|add/i }).last();
    await submitRiskBtn.click();
    await page.waitForTimeout(1000);

    // --- Open Tasks and create a task due soon ---
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/tasks/);

    await page.evaluate(() => {
      localStorage.setItem("tasks-tour", "true");
    });

    const addTaskBtn = page.getByRole("button", { name: /add new task/i });
    await expect(addTaskBtn).toBeVisible({ timeout: 15_000 });
    await addTaskBtn.click();

    await expect(
      page
        .getByText(/create new task/i)
        .or(page.getByText(/add new task/i))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Title
    const titleInput = page
      .getByRole("textbox", { name: /task title/i })
      .or(page.locator('input[name="title"]'))
      .or(page.locator("#title"))
      .or(page.getByPlaceholder(/enter task title/i));
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
    await titleInput.first().fill(taskTitle);

    // Assignees
    const assigneeInput = page
      .locator("#assignees-input")
      .or(page.getByPlaceholder(/select assignees/i));
    await assigneeInput.first().click();
    await page.waitForTimeout(500);
    const assigneeOption = page.getByRole("option").first();
    if (await assigneeOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assigneeOption.click();
    }

    // Due date (3 days from today -> triggers the "due soon" banner)
    const today = new Date();
    const dueSoonDate = new Date(today);
    dueSoonDate.setDate(today.getDate() + 3);
    const formattedDate = dueSoonDate.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });

    const dateInput = page
      .locator(".MuiPickersSectionList-root")
      .or(page.locator(".mui-date-picker"));
    await dateInput.first().click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(formattedDate);
    await page.keyboard.press("Tab");

    // Submit the task
    const submitTaskBtn = page.getByRole("button", { name: /create task/i });
    await submitTaskBtn.click();

    // The deadline-warning query may be cached from before the task was
    // created, so reload the page to force a fresh fetch.
    await page.reload();

    // Clear any persisted snooze so the banner can appear.
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((key) => key.includes("deadline_snooze"))
        .forEach((key) => localStorage.removeItem(key));
    });

    await expect(page.locator('[data-testid="deadline-warning-banner"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="deadline-warning-banner"]')).toContainText(
      /due in the next \d+ days/i,
    );
  });
});
