import { test as base, expect, type Page } from "@playwright/test";
import { createApiContext, orgs, projects, users } from "../factories/api.factory";
import { dismissOnboardingModals, loginAs } from "../helpers/auth.helper";

/**
 * Extended test fixture that provides an authenticated page with a project
 * already created. Every test gets its own organization, admin user, and
 * project so the suite can eventually run in parallel without shared DB state.
 *
 * Cleanup: the entire organization is deleted after the test, cascading to all
 * users, projects, risks, vendors, and tasks created inside it.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/project.fixture";
 *   test("my test", async ({ projectPage, projectName }) => { ... });
 */
export const test = base.extend<{
  projectPage: Page;
  projectName: string;
}>({
  projectName: async ({}, use) => {
    await use(`E2E-Project-${Date.now()}`);
  },

  projectPage: [
    async ({ page, projectName }, use, testInfo) => {
      // 1. Create an isolated organization and admin user via the API.
      const superCtx = await createApiContext();
      const orgName = `E2E Org ${testInfo.workerIndex}-${Date.now()}`;
      const orgId = await orgs.create(superCtx, orgName);
      const admin = await users.seedAdmin(superCtx, orgId, {
        password: "E2EAdmin#1",
      });
      await superCtx.request.dispose();

      // 2. Log the browser in as the isolated admin.
      await loginAs(
        page,
        admin.email,
        admin.password,
        /\/(overview|super-admin)?$/,
      );
      await dismissOnboardingModals(page);

      // 3. Create the project through the API (fast and stable).
      const adminCtx = await createApiContext({
        email: admin.email,
        password: admin.password,
      });
      await projects.create(adminCtx, {
        project_title: projectName,
        owner: admin.userId,
        start_date: new Date().toISOString(),
        goal: "E2E test goal",
        ai_risk_classification: "Minimal risk",
        type_of_high_risk_role: "Deployer",
        members: [admin.userId],
      });
      await adminCtx.request.dispose();

      // 4. Navigate to the overview so the test starts from a consistent place.
      await page.goto("/overview");
      await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 });

      await use(page);

      // 5. Deterministic cleanup: deleting the org removes all related data.
      const cleanupCtx = await createApiContext();
      await orgs.delete(cleanupCtx, orgId);
      await cleanupCtx.request.dispose();
    },
    { timeout: 120_000 },
  ],
});

export { expect };
