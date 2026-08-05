import { test as setup, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";

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
const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://localhost:3000";
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

async function loginAs(
  page: any,
  email: string,
  password: string,
  expectedPath: RegExp,
): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("name.surname@companyname.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(expectedPath, { timeout: 15_000 });
}

async function getAuthToken(page: any): Promise<string> {
  const token = await page.evaluate(() => {
    const persistRoot = localStorage.getItem("persist:root");
    if (!persistRoot) return "";
    try {
      const parsed = JSON.parse(persistRoot);
      const auth = parsed.auth ? JSON.parse(parsed.auth) : null;
      return auth?.authToken || "";
    } catch {
      return "";
    }
  });
  if (!token) {
    throw new Error("Could not extract auth token from localStorage after login");
  }
  return token;
}

async function createOrganization(page: any): Promise<number> {
  const token = await getAuthToken(page);
  const orgName = `E2E Org ${Date.now()}`;
  const response = await page.request.post(`${BACKEND_URL}/api/super-admin/organizations`, {
    data: { name: orgName },
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: true,
  });
  const body = await response.json();
  const orgId = body?.data?.id;
  if (typeof orgId !== "number") {
    throw new Error(`Failed to create E2E organization. Response: ${JSON.stringify(body)}`);
  }
  return orgId;
}

function seedAdminInOrg(orgId: number): SeedOutput {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "vw-e2e-"));
  const credentialsFile = path.join(tmpDir, "e2e-credentials.json");

  const stdout = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["ts-node", "scripts/seedE2EAdmin.ts", String(orgId), `--output-file=${credentialsFile}`],
    {
      cwd: SERVERS_DIR,
      encoding: "utf-8",
      env: process.env,
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

  // 2. Create an organization using the super-admin's authenticated context.
  const orgId = await createOrganization(page);

  // 3. Seed a real Admin user inside that organization.
  const admin = seedAdminInOrg(orgId);

  // 4. Login as the seeded admin and save state.
  await loginAs(
    page,
    admin.email,
    admin.password,
    /\/(overview|super-admin)?$/, // Admin is redirected to /overview
  );
  await page.context().storageState({ path: ADMIN_AUTH_STATE_PATH });
});
