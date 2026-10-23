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

const CRITICAL_PATH_SPECS =
  /(use-cases|risk-management|tasks|critical-journey|reporting-journey|compliance-journey)\.spec\.ts/;
const SUPER_ADMIN_SPECS = /super-admin\.spec\.ts/;
const RISK_INHERITANCE_SPECS = /risk-inheritance\.spec\.ts/;
// Quarantined specs: kept in the project map so `playwright test --list`
// claims every spec file, but the specs self-skip (see #4617 triage notes
// inside each file). Do NOT add real assertions here without rewriting the
// spec against the current routes first.
const QUARANTINE_SPECS = /plugins\.spec\.ts/;
// Feature-coverage specs that all run against the seeded org Admin auth state.
// Quarantined specs (plugins.spec.ts — targets the removed /plugins route,
// superseded by /extensions) live in the dedicated `quarantine` project
// below; see the spec file and Clients/e2e/README.md for the triage note.
// Axe tests inside these files (titles matching /accessibility violations/)
// are carved out via grepInvert and run once under the `a11y` project instead.
const FEATURE_SPECS =
  /[\\/](agent-discovery|ai-detection|ai-gateway|ai-trust-center|approval-workflows|assessment|automations|command-palette|compliance-tracker|dashboard|datasets|evals-dashboard|event-tracker|file-manager|framework-empty-state|frameworks|incidents|intake-forms|model-inventory|navigation|network-resilience|notifications|onboarding|overview|page-not-found|policies|policy-editor|post-market-monitoring|project-view|public-intake-form|recent-activity|reporting|service-worker|settings|shadow-ai|start-here|training|vendors)\.spec\.ts$/;

// Convention for known-flaky tests (issues #4503/#4617 item 9): tag a test
// or describe block with `@flaky` (test("… @flaky", …) or
// test.describe("… @flaky", …)) and it is excluded from every project below.
// Run quarantined tests explicitly with: `npx playwright test --grep @flaky`.
// See Clients/e2e/README.md for the full triage workflow.
const FLAKY_TAG = /@flaky/;

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
      grepInvert: FLAKY_TAG,
      use: { ...devices["Desktop Chrome"] },
    },
    // Super-admin tests: reuse the stored super-admin auth state
    {
      name: "chromium",
      testMatch: SUPER_ADMIN_SPECS,
      grepInvert: FLAKY_TAG,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/user.json",
      },
    },
    // Risk-inheritance reports: need an org that already has risks, so they
    // use their own setup and auth state rather than the empty org that
    // global.setup.ts creates.
    {
      name: "risk-inheritance-setup",
      testMatch: /risk-inheritance\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], channel: browserChannel },
    },
    {
      name: "risk-inheritance",
      testMatch: RISK_INHERITANCE_SPECS,
      grepInvert: FLAKY_TAG,
      dependencies: ["risk-inheritance-setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/risk-inheritance-admin.json",
      },
    },
    // Critical-journey tests: reuse the stored admin auth state
    {
      name: "admin",
      testMatch: CRITICAL_PATH_SPECS,
      grepInvert: FLAKY_TAG,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/admin.json",
      },
    },
    // Feature-coverage tests: reuse the stored admin auth state. Axe tests
    // inside these specs are excluded here (`grepInvert`) so they run exactly
    // once — under the `a11y` project below.
    {
      name: "features",
      testMatch: FEATURE_SPECS,
      grepInvert: [/accessibility violations/, FLAKY_TAG],
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/admin.json",
      },
    },
    // Accessibility scans only. `grep` keeps this to the axe tests rather than
    // switching on the rest of each spec file at the same time. Covers every
    // feature spec; critical-path specs are deliberately absent since their
    // scans already run under the `admin` project.
    {
      name: "a11y",
      testMatch: FEATURE_SPECS,
      grep: /accessibility violations/,
      grepInvert: FLAKY_TAG,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/admin.json",
      },
    },
    // Scheduled canary smoke tests (issue #4681-a) + CSP evidence capture
    // (issue #4686-a), both owned by the canary pod under e2e/canary/. The
    // scheduled workflow runs `npx playwright test --project=canary
    // --grep @canary`, so both specs live in this project. Org Admin auth
    // state: the journey opens /overview, and ProtectedRoute sends a
    // super-admin (user.json) to /super-admin instead. csp-capture tolerates
    // the login redirect on protected routes by design.
    {
      name: "canary",
      testDir: "./e2e/canary",
      testMatch: /(canary|csp-capture)\.spec\.ts/,
      grep: /@canary/,
      grepInvert: FLAKY_TAG,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/admin.json",
      },
    },
    // Quarantined specs (currently only plugins.spec.ts, see the file's
    // #4617 triage note): claimed here so every spec file maps to a project,
    // and self-skip at runtime. Kept on the admin auth state so the file can
    // be reactivated without config changes once rewritten against /extensions.
    {
      name: "quarantine",
      testMatch: QUARANTINE_SPECS,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: "e2e/.auth/admin.json",
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
