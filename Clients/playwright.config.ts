import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

/**
 * Playwright configuration for VerifyWise E2E tests.
 *
 * Prerequisites:
 *   1. PostgreSQL + Redis running
 *   2. Backend built and seeded: cd Servers && npm run build && npx sequelize db:migrate
 *   3. Backend running: cd Servers && npm run watch
 *   4. Frontend dev server started automatically via webServer block below
 */

const CRITICAL_PATH_SPECS = /(use-cases|risk-management|tasks|critical-journey)\.spec\.ts/;
const SUPER_ADMIN_SPECS = /super-admin\.spec\.ts/;
const ACCESSIBILITY_SPECS = /(dashboard|model-inventory|vendors|policies)\.spec\.ts/;

// When Playwright's bundled Chromium is not available (e.g. restricted CDN),
// set PLAYWRIGHT_USE_SYSTEM_CHROME=1 to use the locally installed Google Chrome.
const browserChannel = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME ? "chrome" : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Run sequentially — tests may depend on DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // In CI pair `list` with `github`: `github` emits PR annotations, `list`
  // streams pass/fail lines to the job log so cancellations (timeouts)
  // still leave a readable trail of what passed and what failed.
  reporter: process.env.CI ? [["list"], ["github"]] : "html",
  timeout: 60_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Setup project: logs in once via API, saves auth state
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
      },
    },
    // Main tests: auth tests run without stored auth state
    {
      name: "auth-tests",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Super-admin tests: reuse the stored super-admin auth state
    {
      name: "chromium",
      testMatch: SUPER_ADMIN_SPECS,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/user.json",
      },
    },
    // Critical-journey tests: reuse the stored admin auth state
    {
      name: "admin",
      testMatch: CRITICAL_PATH_SPECS,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/admin.json",
      },
    },
    // Accessibility tests: scan key pages for critical/serious a11y violations
    {
      name: "accessibility",
      testMatch: ACCESSIBILITY_SPECS,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/user.json",
      },
    },
  ],

  webServer: {
    command: "npm run dev:vite",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
