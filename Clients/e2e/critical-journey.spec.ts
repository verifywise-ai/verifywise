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

    // --- Look up project ID and create risk via API ---
    // Extract auth token + user ID from localStorage, query the project list
    // to find the project created by the fixture, then create the risk
    // directly through the API. This avoids fragile combobox interactions.
    const setupData = await page.evaluate(async (name) => {
      const raw = localStorage.getItem("persist:root");
      if (!raw) throw new Error("No persist:root in localStorage");
      const auth = JSON.parse(JSON.parse(raw).auth);
      const token: string = auth.authToken;

      // Decode JWT to get user ID (no verification needed — we trust our own token)
      const payload = JSON.parse(atob(token.split(".")[1]));
      const userId: number = payload.id;

      // Fetch projects and find the one created by the fixture
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      const projects = body?.data?.projects ?? body?.data ?? [];
      const project = projects.find((p: { project_title: string }) => p.project_title === name);
      if (!project) throw new Error(`Project "${name}" not found via API`);
      return { token, userId, projectId: project.id as number };
    }, projectName);

    await page.evaluate(
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
            risk_category: ["Bias"],
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
