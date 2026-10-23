import { test as base, expect, type Page } from "@playwright/test";
import { createApiContext, orgs, projects, users } from "./factories/api.factory";
import { loginAs } from "./helpers/auth.helper";
import { analyzeCriticalAndSeriousViolations, summarizeViolations } from "./helpers/axe";

/**
 * Compliance state-change journey (issue #4617, item 7b).
 *
 * Journey: ISO 42001 clause page → expand a clause → flip the first
 * subclause's StatusDropdown from "Not started" to "Implemented" → the
 * progress stats card reflects the change → the change survives a reload.
 *
 * Server semantics (Servers/utils/iso42001.utils.ts): a subclause counts as
 * "done" when its status is 'Implemented' or 'Audited', so the stats card
 * moves from "0 of N completed" to "1 of N completed".
 */

type IsoOrgFixtures = {
  isoOrgPage: Page;
};

const test = base.extend<IsoOrgFixtures>({
  isoOrgPage: [
    async ({ page }, use, testInfo) => {
      const superCtx = await createApiContext();
      const orgName = `E2E Compliance Org ${testInfo.workerIndex}-${Date.now()}`;
      const orgId = await orgs.create(superCtx, orgName);
      const admin = await users.seedAdmin(superCtx, orgId, { password: "E2EAdmin#1" });
      await superCtx.request.dispose();

      await loginAs(page, admin.email, admin.password, /\/(overview|super-admin)?$/);

      const adminCtx = await createApiContext({
        email: admin.email,
        password: admin.password,
      });
      await projects.create(adminCtx, {
        project_title: `E2E Compliance Org Project ${Date.now()}`,
        owner: admin.userId,
        start_date: new Date().toISOString(),
        goal: "E2E compliance journey project",
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
        const cleanupCtx = await createApiContext();
        await orgs.delete(cleanupCtx, orgId);
        await cleanupCtx.request.dispose();
      }
    },
    { timeout: 120_000 },
  ],
});

test.describe("Compliance journey: subclause status change persists", () => {
  test("flip a subclause to Implemented — stats card updates and the change survives reload", async ({
    isoOrgPage: page,
  }) => {
    await page.goto("/framework/controls?framework=iso-42001");

    // Baseline: stats card shows "0 of N completed".
    const caption = page.getByText(/of \d+ completed/i).first();
    await expect(caption).toBeVisible({ timeout: 20_000 });
    await expect(caption).toHaveText(/0 of [1-9][0-9]* completed/i);

    // Expand the first clause accordion to load its subclause rows.
    const firstAccordion = page.locator(".MuiAccordion-root").first();
    await expect(firstAccordion).toBeVisible({ timeout: 15_000 });
    await firstAccordion.locator(".MuiAccordionSummary-root").first().click();

    const statusSelect = firstAccordion.getByRole("combobox").first();
    await expect(statusSelect).toBeVisible({ timeout: 15_000 });
    await expect(statusSelect).toHaveText(/not started/i);

    await statusSelect.click();
    await page.getByRole("option", { name: "Implemented" }).click();

    // The page refetches clauses + progress after a successful save.
    await expect(page.getByText(/status updated successfully/i)).toBeVisible({ timeout: 15_000 });
    await expect(caption).toHaveText(/1 of [1-9][0-9]* completed/i, { timeout: 20_000 });
    await expect(firstAccordion.getByRole("combobox").first()).toHaveText(/implemented/i, {
      timeout: 15_000,
    });

    // Reload and verify persistence.
    await page.reload();
    await expect(caption).toHaveText(/1 of [1-9][0-9]* completed/i, { timeout: 20_000 });

    const reloadedAccordion = page.locator(".MuiAccordion-root").first();
    await reloadedAccordion.locator(".MuiAccordionSummary-root").first().click();
    await expect(reloadedAccordion.getByRole("combobox").first()).toHaveText(/implemented/i, {
      timeout: 15_000,
    });
  });

  test("page has no critical or serious accessibility violations", async ({ isoOrgPage: page }) => {
    await page.goto("/framework/controls?framework=iso-42001");
    await page.waitForLoadState("domcontentloaded");

    const violations = await analyzeCriticalAndSeriousViolations(page, {
      reportName: "compliance-journey-iso-clauses",
    });
    expect(summarizeViolations(violations)).toEqual([]);
  });
});
