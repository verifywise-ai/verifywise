import { expect } from "@playwright/test";
import { test } from "./fixtures/project.fixture";

/**
 * Dashboard recent-activity deep links (issue #4820, item a).
 *
 * ActivityItem renders every recent-activity row as a real link whose
 * destination is built by getActivityLink()
 * (Clients/src/presentation/components/ActivityItem/activityRoutes.ts):
 *   - risk    → /risk-management?riskId=<id>
 *   - useCase → /project-view?projectId=<id>
 *
 * Rows expose `role="listitem"` with an aria-label of
 * "<Type>: <title> at <timestamp>", which is what these tests anchor on —
 * far more stable than CSS class chains.
 */

/** Pull the JWT out of the Redux-persisted auth slice (same pattern as critical-journey.spec.ts). */
async function readAuthToken(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("persist:root");
    if (!raw) throw new Error("No persist:root in localStorage");
    const auth = JSON.parse(JSON.parse(raw).auth);
    return auth.authToken as string;
  });
}

/**
 * Open the dashboard with live metrics. useDashboardMetrics skips the network
 * for 30 s after any earlier dashboard load (and storage state can carry that
 * cache in), so a risk or use case created moments ago would not show.
 */
async function openFreshDashboard(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => key.includes("dashboard_metrics_cache"))
      .forEach((key) => localStorage.removeItem(key));
  });
  await page.goto("/");
}

async function dismissWelcomeDialog(page: import("@playwright/test").Page) {
  const welcomeSkip = page.getByRole("button", { name: /skip for now/i });
  if (await welcomeSkip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await welcomeSkip.click();
    await page.waitForTimeout(1_000);
  }
}

test.describe("Dashboard recent activity navigation", () => {
  test("risk activity row deep-links to /risk-management?riskId=…", async ({
    projectPage: page,
    projectName,
  }) => {
    const token = await readAuthToken(page);

    // Resolve the isolated project's id.
    const projectId = await page.evaluate(
      async ({ token, name }) => {
        const res = await fetch("/api/projects", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        const projects = body?.data?.projects ?? body?.data ?? [];
        const project = projects.find((p: { project_title: string }) => p.project_title === name);
        if (!project) throw new Error(`Project "${name}" not found via API`);
        return project.id as number;
      },
      { token, name: projectName },
    );

    // Seed a risk so the risk row shows up in recent activity.
    const riskName = `E2E Activity Risk ${Date.now()}`;
    const riskResponse = await page.evaluate(
      async ({ token, projectId, riskName }) => {
        const res = await fetch("/api/projectRisks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            risk_name: riskName,
            risk_owner: JSON.parse(atob(token.split(".")[1])).id,
            risk_description: "E2E recent-activity navigation risk",
            projects: [projectId],
            risk_level_autocalculated: "Medium risk",
          }),
        });
        if (!res.ok) throw new Error(`Risk creation failed: ${res.status}`);
        return res.json();
      },
      { token, projectId, riskName },
    );
    const riskId = riskResponse?.data?.id as number;
    expect(riskId).toBeGreaterThan(0);

    await openFreshDashboard(page);
    await dismissWelcomeDialog(page);

    // The Recent activity card lives in the executive view; switch when the
    // toggle is available.
    const executiveToggle = page.getByRole("button", { name: /executive/i });
    if (
      await executiveToggle
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      await executiveToggle.first().click();
      await page.waitForTimeout(1_000);
    }

    const riskRow = page.getByRole("listitem", {
      name: new RegExp(`^Risk: ${riskName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} at `),
    });
    await expect(riskRow).toBeVisible({ timeout: 20_000 });

    // The row must be a real link and navigate to the risk deep link.
    const rowLink = riskRow.locator("a").first();
    await expect(rowLink).toBeVisible();
    await rowLink.click();
    await expect(page).toHaveURL(new RegExp(`/risk-management\\?riskId=${riskId}`), {
      timeout: 15_000,
    });
  });

  test("use-case activity row deep-links to /project-view?projectId=…", async ({
    projectPage: page,
    projectName,
  }) => {
    await openFreshDashboard(page);
    await dismissWelcomeDialog(page);

    const executiveToggle = page.getByRole("button", { name: /executive/i });
    if (
      await executiveToggle
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      await executiveToggle.first().click();
      await page.waitForTimeout(1_000);
    }

    // The freshly created fixture project must be the most recent use case.
    const useCaseRow = page.getByRole("listitem", {
      name: new RegExp(`^Use case: ${projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} at `),
    });
    await expect(useCaseRow).toBeVisible({ timeout: 20_000 });

    const rowLink = useCaseRow.locator("a").first();
    await expect(rowLink).toBeVisible();

    // Resolve the project id to assert the exact deep link target.
    const token = await readAuthToken(page);
    const projectId = await page.evaluate(
      async ({ token, name }) => {
        const res = await fetch("/api/projects", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        const projects = body?.data?.projects ?? body?.data ?? [];
        const project = projects.find((p: { project_title: string }) => p.project_title === name);
        if (!project) throw new Error(`Project "${name}" not found via API`);
        return project.id as number;
      },
      { token, name: projectName },
    );

    await rowLink.click();
    await expect(page).toHaveURL(new RegExp(`/project-view\\?projectId=${projectId}`), {
      timeout: 15_000,
    });
  });
});
