import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

/**
 * Playwright configuration for VerifyWise E2E tests.
 *
 * Prerequisites:
 *   1. PostgreSQL + Redis running
 *   2. Backend built and seeded: cd Servers && npm run build && npx sequelize db:migrate
 *   3. Backend running: cd Servers && npm run watch
 *   4. Frontend dev server started automatically via webServer block below
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Run sequentially — tests may depend on DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",
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
    },
    // Main tests: auth tests run without stored auth state
    {
      name: "auth-tests",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Authenticated tests: reuse the stored auth state (no repeated logins)
    {
      name: "chromium",
      testIgnore: /auth\.spec\.ts|global\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
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
