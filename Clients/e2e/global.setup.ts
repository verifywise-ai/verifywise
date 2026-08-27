import { test as setup } from "@playwright/test";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { existsSync, mkdtempSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { loginAs } from "./helpers/auth.helper";
import { createApiContext, orgs, projects, projectRisks, tasks } from "./factories/api.factory";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const SERVERS_DIR = path.resolve(__dirname, "../../Servers");

const USER_AUTH_STATE_PATH = "e2e/.auth/user.json";
const ADMIN_AUTH_STATE_PATH = "e2e/.auth/admin.json";

interface SeedOutput {
  orgId: number;
  userId: number;
  email: string;
  password: string;
  credentialsFile: string | null;
}

const E2E_NODE_ENV = process.env.E2E_NODE_ENV || "test";
const SETUP_ORG_NAME = "E2E Global Setup Org";

function seedAdminInOrg(orgId: number): SeedOutput {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: E2E_NODE_ENV };
  if (E2E_NODE_ENV === "test") {
    // seedE2EAdmin.ts connects via Servers/database/db.ts. Its config module
    // reads process.env at import time, before db.ts's own .env.test override
    // runs, so the test DB values must already be in the child env. This
    // mirrors the integration-suite convention (tests/integration/globalSetup.js).
    const envTestPath = path.resolve(SERVERS_DIR, ".env.test");
    if (existsSync(envTestPath)) {
      Object.assign(env, dotenv.parse(readFileSync(envTestPath, "utf8")));
    }
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), "vw-e2e-"));
  const credentialsFile = path.join(tmpDir, "e2e-credentials.json");

  const stdout = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["ts-node", "scripts/seedE2EAdmin.ts", String(orgId), `--output-file=${credentialsFile}`],
    {
      cwd: SERVERS_DIR,
      encoding: "utf-8",
      env,
      shell: true,
    },
  );
  const lastLine = stdout.trim().split("\n").pop() || "";
  const metadata = JSON.parse(lastLine) as Omit<SeedOutput, "password">;

  if (!metadata.credentialsFile) {
    throw new Error("seedE2EAdmin did not write a credentials file");
  }

  const credentials = JSON.parse(readFileSync(metadata.credentialsFile, "utf-8")) as SeedOutput;

  // Clean up the temporary credentials file as soon as we've read it.
  try {
    unlinkSync(metadata.credentialsFile);
  } catch {
    // Best-effort cleanup; don't fail the setup if the file is already gone.
  }

  return credentials;
}

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
