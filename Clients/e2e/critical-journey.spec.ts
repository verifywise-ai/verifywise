import { expect } from "@playwright/test";
import { test } from "./fixtures/project.fixture";
import { testIds } from "./test-ids";

test.describe("Critical end-to-end journey", () => {
  test("login as isolated admin → create project → add risk → open Tasks → verify Deadline Warning banner", async ({
    projectPage: page,
    projectName,
  }) => {
    const riskTitle = `E2E Critical Risk ${Date.now()}`;
    const taskTitle = `E2E Critical Task ${Date.now()}`;

    // --- Create the project risk via the authenticated browser context ---
    const setupData = await page.evaluate(async (name) => {
      const raw = localStorage.getItem("persist:root");
      if (!raw) throw new Error("No persist:root in localStorage");
      const auth = JSON.parse(JSON.parse(raw).auth);
      const token: string = auth.authToken;

      const payload = JSON.parse(atob(token.split(".")[1]));
      const userId: number = payload.id;

      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      const projects = body?.data?.projects ?? body?.data ?? [];
      const project = projects.find(
        (p: { project_title: string }) => p.project_title === name,
      );
      if (!project) throw new Error(`Project "${name}" not found via API`);
      return { token, userId, projectId: project.id as number };
    }, projectName);

    const riskResponse = await page.evaluate(
      ({ riskName, token, userId, projectId: pid }) =>
        fetch("/api/projectRisks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            risk_name: riskName,
            risk_owner: userId,
            risk_description: "E2E critical journey risk for deadline testing",
            ai_lifecycle_phase: "Problem definition & planning",
            risk_category: ["Strategic risk"],
            impact: "High potential impact on fairness and transparency",
            projects: [pid],
          }),
        }).then((r) => {
          if (!r.ok) throw new Error(`Risk creation failed: ${r.status}`);
          return r.json();
        }),
      {
        riskName: riskTitle,
        token: setupData.token,
        userId: setupData.userId,
        projectId: setupData.projectId,
      },
    );

    expect(riskResponse).toHaveProperty("data.id");

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
      page.getByRole("heading", { name: /create new task/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Title
    const titleInput = page.locator("#title");
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(taskTitle);

    // Assignees
    const assigneeInput = page.locator("#assignees-input");
    await expect(assigneeInput).toBeVisible({ timeout: 10_000 });
    await assigneeInput.click();
    const assigneeOption = page.getByRole("option").first();
    await expect(assigneeOption).toBeVisible({ timeout: 5_000 });
    await assigneeOption.click();

    // Due date (3 days from today -> triggers the "due soon" banner)
    const today = new Date();
    const dueSoonDate = new Date(today);
    dueSoonDate.setDate(today.getDate() + 3);
    const dayOfMonth = dueSoonDate.getDate();

    const calendarIcon = page
      .locator(".mui-date-picker")
      .getByRole("button", { name: /choose date/i });
    await calendarIcon.click();

    const calendarPopup = page.locator(
      ".MuiPickerPopper-root, .MuiPickersPopper-root",
    );
    await expect(calendarPopup.first()).toBeVisible({ timeout: 5_000 });

    const dayCell = page
      .locator('[role="gridcell"]')
      .filter({ hasText: new RegExp(`^${dayOfMonth}$`) })
      .first();
    await expect(dayCell).toBeVisible({ timeout: 5_000 });
    await dayCell.click();

    // Submit the task
    const submitTaskBtn = page.getByRole("button", { name: /create task/i });
    await expect(submitTaskBtn).toBeVisible({ timeout: 10_000 });
    await submitTaskBtn.click();

    // Clear any stale deadline snooze and reload to force a fresh summary fetch.
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((key) => key.includes("deadline_snooze"))
        .forEach((key) => localStorage.removeItem(key));
    });

    const deadlineResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/deadlines/summary") && resp.status() === 200,
      { timeout: 15_000 },
    );
    await page.reload();
    await deadlineResponse;

    const banner = page.locator(
      `[data-testid="${testIds.deadlineBanner.warningBanner}"]`,
    );
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText(/due in the next \d+ days/i);
  });
});
