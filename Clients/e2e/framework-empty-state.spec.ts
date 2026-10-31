import { test as base, expect, type Page } from "@playwright/test";
import { createApiContext, orgs, projects, users } from "./factories/api.factory";
import { loginAs } from "./helpers/auth.helper";
import { analyzeCriticalAndSeriousViolations, summarizeViolations } from "./helpers/axe";

/**
 * Framework stats-card empty state (issue #4820, item b).
 *
 * StatsCard (Clients/src/presentation/components/Cards/StatsCard) renders the
 * "No regulation connected — link a framework to track progress" empty state
 * when `total === 0`, and "{items}: {done} of {total} completed" otherwise.
 *
 * TRIAGE NOTE (#4820, 2026-10-20): the total===0 branch is implemented and
 * unit-tested (StatsCard.test.tsx), but it is NOT reachable through the API:
 * linking ISO 42001 to a project (at creation or via addFrameworkToProject)
 * auto-generates every subclause row on the server
 * (Servers/utils/frameworkRegistry.utils.ts), so
 * `/iso-42001/clauses/progress/:id` never returns totalSubclauses = 0 for a
 * connected framework. These tests therefore pin the implemented behavior on
 * the ISO 42001 clause page: a connected framework always shows a real
 * "of N completed" count and never the degenerate "0 of 0 · 0%" the issue
 * describes. The empty-state test is written but skipped until a seedable
 * 0-item framework state exists.
 */

type IsoOrgFixtures = {
  isoOrgPage: Page;
};

const test = base.extend<IsoOrgFixtures>({
  isoOrgPage: [
    async ({ page }, use, testInfo) => {
      // 1. Isolated org + admin (the admin is the org creator).
      const superCtx = await createApiContext();
      const orgName = `E2E ISO Org ${testInfo.workerIndex}-${Date.now()}`;
      const orgId = await orgs.create(superCtx, orgName);
      const admin = await users.seedAdmin(superCtx, orgId, { password: "E2EAdmin#1" });
      await superCtx.request.dispose();

      // 2. Log the browser in as the isolated admin.
      await loginAs(page, admin.email, admin.password, /\/(overview|super-admin)?$/);

      // 3. Organizational project with ISO 42001 (framework id 2) connected.
      const adminCtx = await createApiContext({
        email: admin.email,
        password: admin.password,
      });
      await projects.create(adminCtx, {
        project_title: `E2E ISO Org Project ${Date.now()}`,
        owner: admin.userId,
        start_date: new Date().toISOString(),
        goal: "E2E ISO framework test project",
        ai_risk_classification: "Minimal risk",
        high_risk_roles: ["Deployer"],
        members: [admin.userId],
        framework: [2],
        is_organizational: true,
      });
      await adminCtx.request.dispose();

      try {
        await use(page);
      } finally {
        // 4. Deleting the org cascades to the project and all framework rows.
        const cleanupCtx = await createApiContext();
        await orgs.delete(cleanupCtx, orgId);
        await cleanupCtx.request.dispose();
      }
    },
    { timeout: 120_000 },
  ],
});

test.describe("Framework stats card empty state (ISO 42001)", () => {
  test("connected framework shows a real count, never a degenerate 0 of 0", async ({
    isoOrgPage: page,
  }) => {
    await page.goto("/framework/controls?framework=iso-42001");

    // The clause-page stats card caption reads
    // "Clauses: {done} of {total} completed". Wait for it, then pin both the
    // positive shape and the absence of the degenerate "0 of 0" form.
    const caption = page.getByText(/of \d+ completed/i).first();
    await expect(caption).toBeVisible({ timeout: 20_000 });
    await expect(caption).toHaveText(/of [1-9][0-9]* completed/i);
    await expect(page.getByText(/0\s*of\s*0/i)).toHaveCount(0);
  });

  test("framework with 0 items shows the 'No regulation connected' empty state", async () => {
    // #4820 triage: NOT REACHABLE end-to-end. Connecting ISO 42001 to a
    // project auto-generates all subclause rows on the server, so the
    // clause-page progress endpoint never returns totalSubclauses = 0. The
    // empty-state branch itself is implemented in StatsCard and covered by
    // StatsCard.test.tsx. Activate this test once a 0-item framework state
    // can be seeded (or expose a test-only unlink endpoint).
    test.skip(
      true,
      "Unreachable via API flows: framework linking auto-generates items (#4820 triage 2026-10-20).",
    );
  });

  test("page has no critical or serious accessibility violations", async ({ isoOrgPage: page }) => {
    await page.goto("/framework/controls?framework=iso-42001");
    await page.waitForLoadState("domcontentloaded");

    const violations = await analyzeCriticalAndSeriousViolations(page, {
      reportName: "framework-iso-clauses",
    });
    expect(summarizeViolations(violations)).toEqual([]);
  });
});
