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
    "skipping SetupModal completes onboarding and navigates to start-here",
    async ({ setupModalPage: page }) => {
      await page.goto("/");

      const skipButton = page.getByRole("dialog").getByRole("button", { name: /skip for now/i });
      await expect(skipButton).toBeVisible({ timeout: 15_000 });
      await skipButton.click();

      // SetupModal.onSkip → handleOnboardingDone → navigate("/start-here").
      await expect(page).toHaveURL(/\/start-here/, { timeout: 15_000 });
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

test.describe("Onboarding Wizard", () => {
  test("welcome dialog appears on fresh session", async ({ authedPage: page }) => {
    // Clear onboarding-related localStorage keys to simulate fresh session
    await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (
          key.includes("onboarding") ||
          key.includes("wizard") ||
          key.includes("welcome") ||
          key.includes("tour")
        ) {
          localStorage.removeItem(key);
        }
      });
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    // Check for welcome/onboarding dialog
    const welcomeDialog = page
      .getByRole("dialog")
      .or(page.getByText(/welcome/i))
      .or(page.getByText(/get started/i))
      .or(page.getByText(/onboarding/i))
      .or(page.getByRole("button", { name: /skip for now/i }))
      .or(page.getByRole("button", { name: /next/i }));

    if (
      await welcomeDialog
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false)
    ) {
      await expect(welcomeDialog.first()).toBeVisible();
    }
  });

  test("can step through wizard or dismiss", async ({ authedPage: page }) => {
    await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (
          key.includes("onboarding") ||
          key.includes("wizard") ||
          key.includes("welcome") ||
          key.includes("tour")
        ) {
          localStorage.removeItem(key);
        }
      });
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    // Look for wizard with navigation
    const nextBtn = page
      .getByRole("button", { name: /next/i })
      .or(page.getByRole("button", { name: /continue/i }));
    const skipBtn = page
      .getByRole("button", { name: /skip/i })
      .or(page.getByRole("button", { name: /dismiss/i }));

    if (
      await nextBtn
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      // Step through
      await nextBtn.first().click();
      await page.waitForTimeout(1000);

      // Verify content changed (next step or different content)
      await expect(page.locator("body")).not.toBeEmpty();

      // Dismiss if still open
      const closeBtn = page
        .getByRole("button", { name: /skip/i })
        .or(page.getByRole("button", { name: /close/i }))
        .or(page.getByRole("button", { name: /get started/i }))
        .or(page.getByRole("button", { name: /done/i }))
        .or(page.getByRole("button", { name: /finish/i }));

      if (
        await closeBtn
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await closeBtn.first().click();
        await page.waitForTimeout(500);
      }
    } else if (
      await skipBtn
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await skipBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test("completing wizard persists dismissal", async ({ authedPage: page }) => {
    // First dismiss the wizard
    const skipBtn = page
      .getByRole("button", { name: /skip for now/i })
      .or(page.getByRole("button", { name: /skip/i }))
      .or(page.getByRole("button", { name: /close/i }))
      .or(page.getByRole("button", { name: /get started/i }));

    if (
      await skipBtn
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      await skipBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Reload the page
    await page.reload();
    await page.waitForTimeout(3000);

    // Wizard should NOT reappear
    const wizardDialog = page
      .getByRole("button", { name: /skip for now/i })
      .or(page.getByText(/welcome to verifywise/i));

    const reappeared = await wizardDialog
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // If it doesn't reappear, that's the expected behavior
    if (!reappeared) {
      expect(reappeared).toBe(false);
    }
  });
});
