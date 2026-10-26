import { expect } from "@playwright/test";
import { test } from "./fixtures/project.fixture";
import { analyzeCriticalAndSeriousViolations, summarizeViolations } from "./helpers/axe";

/**
 * Reporting journey: generate → download (issue #4617, item 7a).
 *
 * Flow:
 *   1. Seed a report run through the real backend API
 *      (POST /api/reporting/v2/generate-report, the same endpoint the
 *      GenerateReport modal calls — Clients/src/application/repository/reporting.repository.ts)
 *      and poll GET /api/reporting/runs/:id until the run completes.
 *   2. In the UI, open /reporting, find the run row, open its row-actions
 *      menu and download the file — asserting a real browser download event.
 *
 * The generation step is API-driven (like global.setup seeds baseline data):
 * the modal's multi-page wizard is already exercised by reporting.spec.ts;
 * this spec covers the generation → artifact → download chain end to end.
 */

const REPORT_POLL_INTERVAL_MS = 2_000;
const REPORT_POLL_TIMEOUT_MS = 90_000;

async function readAuthToken(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("persist:root");
    if (!raw) throw new Error("No persist:root in localStorage");
    const auth = JSON.parse(JSON.parse(raw).auth);
    return auth.authToken as string;
  });
}

test.describe("Reporting journey: generate → download", () => {
  test("generated report run appears in the list and downloads as a file", async ({
    projectPage: page,
    projectName,
  }) => {
    // The default 60 s test timeout is shorter than the report poll alone; when
    // generation ran long, the test was killed mid-poll and the retry's setup
    // deleted the org under it (seen as "poll run failed: 401").
    test.setTimeout(REPORT_POLL_TIMEOUT_MS + 60_000);
    const token = await readAuthToken(page);

    const { projectId } = await page.evaluate(
      async ({ token, name }) => {
        const res = await fetch("/api/projects", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        const projects = body?.data?.projects ?? body?.data ?? [];
        const project = projects.find((p: { project_title: string }) => p.project_title === name);
        if (!project) throw new Error(`Project "${name}" not found via API`);
        return { projectId: project.id as number };
      },
      { token, name: projectName },
    );

    // --- 1. Enqueue generation through the real v2 endpoint ---
    const reportName = `E2E Journey Report ${Date.now()}`;
    const generateResponse = await page.evaluate(
      async ({ token, projectId, reportName }) => {
        const res = await fetch("/api/reporting/v2/generate-report", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId,
            reportName,
            reportType: ["all"],
            format: "pdf",
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(`generate-report failed: ${res.status} ${JSON.stringify(body)}`);
        }
        return body;
      },
      { token, projectId, reportName },
    );
    const runId = generateResponse?.data?.runId ?? generateResponse?.runId;
    expect(runId).toBeGreaterThan(0);

    // --- 2. Poll the run until it reaches a terminal, downloadable state ---
    const deadline = Date.now() + REPORT_POLL_TIMEOUT_MS;
    let run: any;
    do {
      await page.waitForTimeout(REPORT_POLL_INTERVAL_MS);
      run = await page.evaluate(
        async ({ token, runId }) => {
          const res = await fetch(`/api/reporting/runs/${runId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`poll run failed: ${res.status}`);
          return (await res.json()).data;
        },
        { token, runId },
      );
    } while (
      Date.now() < deadline &&
      run &&
      !["success", "failed", "partial_success"].includes(run.status)
    );

    // partial_success is still downloadable (per the ReportRunStatus docs).
    expect(
      run?.status,
      `report run ${runId} did not finish in time (last status: ${run?.status}, error: ${run?.error_message})`,
    ).toMatch(/success/);
    expect(run?.file_id ?? run?.fileId).toBeTruthy();

    // --- 3. Download the run's file from the /reporting UI ---
    await page.evaluate(() => {
      localStorage.setItem("reporting-tour", "true");
    });
    await page.goto("/reporting");
    await expect(page).toHaveURL(/\/reporting/);

    // The runs table shows the generated file name, where spaces become underscores
    const reportRow = page
      .getByRole("row", { name: new RegExp(reportName.replace(/ /g, "[ _]")) })
      .first();
    await expect(reportRow).toBeVisible({ timeout: 20_000 });

    const rowActions = reportRow.getByRole("button", { name: /actions/i });
    await rowActions.click();
    const downloadItem = page.getByRole("menuitem", { name: /download/i });
    await expect(downloadItem).toBeVisible({ timeout: 5_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await downloadItem.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$|report/i);
  });

  test("page has no critical or serious accessibility violations", async ({
    projectPage: page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem("reporting-tour", "true");
    });
    await page.goto("/reporting");
    await page.waitForLoadState("domcontentloaded");

    const violations = await analyzeCriticalAndSeriousViolations(page, {
      reportName: "reporting-journey",
    });
    expect(summarizeViolations(violations)).toEqual([]);
  });
});
