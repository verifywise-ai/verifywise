import { test as setup } from "@playwright/test";
import { loginAs } from "./helpers/auth.helper";
import { seedAdminInOrg } from "./helpers/seedAdmin.helper";
import { createApiContext, orgs, projects, projectRisks, tasks } from "./factories/api.factory";

/**
 * Global setup: logs in once via the real UI and saves browser storage state.
 * All tests that need authentication reuse this state instead of
 * logging in through the UI every time.
 *
 * This uses the actual login flow (not localStorage injection) because
 * the app's version-based cache invalidation in store.ts wipes any
 * manually-set persist:* keys on page load if the version doesn't match.
 *
 * The setup now produces two auth states:
 *   - e2e/.auth/user.json  -> default super-admin user
 *   - e2e/.auth/admin.json -> an Admin user seeded into an organization
 *                             created by the super-admin
 */

const TEST_EMAIL = process.env.E2E_EMAIL || "verifywise@email.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "Verifywise#1";

const USER_AUTH_STATE_PATH = "e2e/.auth/user.json";
const ADMIN_AUTH_STATE_PATH = "e2e/.auth/admin.json";

const SETUP_ORG_NAME = "E2E Global Setup Org";

setup("authenticate", async ({ page }) => {
  // 1. Login as the default super-admin and save state.
  await loginAs(page, TEST_EMAIL, TEST_PASSWORD, /\/(super-admin)?$/);
  await page.context().storageState({ path: USER_AUTH_STATE_PATH });

  // 2. Use the super-admin API context to manage the setup organization.
  const superCtx = await createApiContext();

  //    Clean up any stale organization left by previous runs so the test DB
  //    does not accumulate baseline projects over repeated local executions.
  const existingOrgs = await orgs.getAll(superCtx);
  const staleOrg = existingOrgs.find((o) => o.name === SETUP_ORG_NAME);
  if (staleOrg) {
    await orgs.delete(superCtx, staleOrg.id);
  }

  // 3. Create a deterministic setup organization and seed an Admin inside it.
  const orgId = await orgs.create(superCtx, SETUP_ORG_NAME);
  await superCtx.request.dispose();
  const admin = seedAdminInOrg(orgId);

  // 4. Seed a baseline project + risk for the admin org so auth-state tests
  //    have real data to exercise (activity log, task linking, risk cards).
  const adminCtx = await createApiContext({
    email: admin.email,
    password: admin.password,
  });
  const baselineProject = await projects.create(adminCtx, {
    project_title: "E2E Baseline Project",
    owner: admin.userId,
    start_date: new Date().toISOString(),
    goal: "Global setup baseline project",
    ai_risk_classification: "Minimal risk",
    type_of_high_risk_role: "Deployer",
    members: [admin.userId],
    framework: [1],
    enable_ai_data_insertion: false,
  });
  await projectRisks.create(adminCtx, {
    risk_name: "E2E Baseline Risk",
    risk_owner: admin.userId,
    projects: [baselineProject.id],
    risk_level_autocalculated: "High risk",
  });

  // Seed enough tasks to exercise pagination in the tasks spec.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      tasks.create(adminCtx, {
        title: `E2E Baseline Task ${i + 1}`,
        description: "Global setup baseline task",
        due_date: dueDate.toISOString(),
        priority: "Medium",
        status: "Open",
        assignees: [admin.userId],
      }),
    ),
  );

  await adminCtx.request.dispose();

  // 5. Login as the seeded admin and save state.
  await loginAs(
    page,
    admin.email,
    admin.password,
    /\/(overview|super-admin)?$/, // Admin is redirected to /overview
  );
  await page.context().storageState({ path: ADMIN_AUTH_STATE_PATH });
});
