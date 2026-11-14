import { test, expect } from "./fixtures/auth.fixture";
import type { Page } from "@playwright/test";
import { createApiContext, orgs, users } from "./factories/api.factory";
import { loginAs } from "./helpers/auth.helper";

/**
 * Fixture for the SetupModal tests: a brand-new organization whose seeded
 * admin is the org creator. The organization's onboarding_status defaults to
 * 'pending' (Servers/database/migrations/20260226234301-public-schema-tables.js),
 * which is exactly the state that makes App.tsx render SetupModal on the
 * dashboard route (useOnboarding: status === 'pending' && isOrgCreator).
 */
const setupTest = test.extend<{ setupModalPage: Page }>({
  setupModalPage: [
    async ({ page }, use, testInfo) => {
      const superCtx = await createApiContext();
      const orgName = `E2E SetupModal Org ${testInfo.workerIndex}-${Date.now()}`;
      const orgId = await orgs.create(superCtx, orgName);
      const admin = await users.seedAdmin(superCtx, orgId, { password: "E2EAdmin#1" });
      await superCtx.request.dispose();

      try {
        await loginAs(page, admin.email, admin.password, /\/(overview|super-admin)?$/);
        await use(page);
      } finally {
        const cleanupCtx = await createApiContext();
        await orgs.delete(cleanupCtx, orgId);
        await cleanupCtx.request.dispose();
      }
    },
    { timeout: 120_000 },
  ],
});

test.describe("Onboarding SetupModal (org creator, pending onboarding)", () => {
  setupTest(
    "SetupModal offers demo data or a blank start to the org creator",
    async ({ setupModalPage: page }) => {
      await page.goto("/");

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(dialog.getByText(/welcome to verifywise/i)).toBeVisible();
      await expect(dialog.getByText(/add demo data/i)).toBeVisible();
      await expect(dialog.getByText(/start blank/i)).toBeVisible();
      await expect(dialog.getByRole("button", { name: /skip for now/i })).toBeVisible();
    },
  );

  setupTest(
    "skipping SetupModal completes onboarding and opens Home's Get started tab",
    async ({ setupModalPage: page }) => {
      await page.goto("/");

      const skipButton = page.getByRole("dialog").getByRole("button", { name: /skip for now/i });
      await expect(skipButton).toBeVisible({ timeout: 15_000 });
      await skipButton.click();

      // SetupModal.onSkip → handleOnboardingDone → navigate("/home?tab=get-started").
      await expect(page).toHaveURL(/\/home\?tab=get-started/, { timeout: 15_000 });
    },
  );

  setupTest(
    "SetupModal shows the LLM-key step with a CTA deep-linking to /settings/apikeys",
    async ({ setupModalPage: page }) => {
      // #4820 triage (2026-10-20): NOT IMPLEMENTED. The SetupModal only offers
      // "Add demo data" / "Start blank"; there is no LLM-key step, and no
      // /settings/apikeys route exists (the API-keys settings live at
      // /ai-gateway/settings/api-keys). Written against the intended behavior
      // so it activates once the feature ships — keep the assertions strict.
      test.skip(
        true,
        "#4820: LLM-key onboarding step does not exist yet " +
          "(SetupModal has no such step; /settings/apikeys is not a route).",
      );

      await page.goto("/");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      // The LLM-key step must offer a CTA that deep-links to the API-keys page.
      const cta = dialog.getByRole("link", { name: /api key|llm|connect/i });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", /\/settings\/apikeys/);
    },
  );
});
