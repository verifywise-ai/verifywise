import { test as setup } from "@playwright/test";
import { loginAs } from "./helpers/auth.helper";
import { seedAdminInOrg, SeedOutput } from "./helpers/seedAdmin.helper";
import { createApiContext, projects, projectRisks, riskLinks } from "./factories/api.factory";

/**
 * Auth state for the risk-inheritance reports.
 *
 * Deliberately separate from global.setup.ts: that one creates a brand-new
 * organization on every run, so its admin sees zero risks — which would make
 * the duplicate and coverage sections render their empty states and verify
 * nothing. These reports are aggregates, so they need an organization that
 * already has risks in it.
 *
 * E2E_REPORT_ORG_ID picks that organization (default 1, the dev-bootstrap org).
 * When it has no active risks — a fresh CI database — a small fixed set is
 * seeded so every report section has rows: a near-duplicate pair, a gap with a
 * risk level, a gap that also sits in a bare project, and a no-framework risk.
 * An org that already has risks is left untouched.
 * seedAdminInOrg is idempotent: it re-seeds the existing admin rather than
 * creating a second one, and reads the password from the restricted file the
 * seed script writes (it no longer prints it).
 */

const ORG_ID = Number(process.env.E2E_REPORT_ORG_ID || "1");
// Its own user: global.setup.ts seeds the default e2e admin into its own org,
// and the seed script returns an existing user by email wherever it lives.
const REPORT_ADMIN_EMAIL =
  process.env.E2E_REPORT_ADMIN_EMAIL || "e2e-risk-inheritance-admin@verifywise.local";
export const REPORT_AUTH_STATE_PATH = "e2e/.auth/risk-inheritance-admin.json";

async function seedReportDataIfEmpty(admin: SeedOutput) {
  const ctx = await createApiContext({ email: admin.email, password: admin.password });
  try {
    const summary = await riskLinks.coverageSummary(ctx);
    if (summary.total_active_risks > 0) return;

    const startDate = new Date().toISOString();
    const framed = await projects.create(ctx, {
      project_title: "E2E Risk Inheritance Framework Project",
      owner: admin.userId,
      start_date: startDate,
      goal: "Risk inheritance report seed",
      ai_risk_classification: "Minimal risk",
      type_of_high_risk_role: "Deployer",
      framework: [1],
      enable_ai_data_insertion: false,
    });
    const bare = await projects.create(ctx, {
      project_title: "E2E Risk Inheritance Bare Project",
      owner: admin.userId,
      start_date: startDate,
      goal: "Risk inheritance report seed",
      framework: [],
      enable_ai_data_insertion: false,
    });

    const description = "Historical training data under-represents younger applicants.";
    await projectRisks.create(ctx, {
      risk_name: "Training data bias in the credit scoring model",
      risk_description: description,
      risk_category: ["Compliance risk"],
      ai_lifecycle_phase: "Data collection & processing",
      risk_owner: admin.userId,
      projects: [framed.id],
      risk_level_autocalculated: "High risk",
    });
    // Same wording and category (the duplicate scan only compares risks that
    // share one), and in both projects: the duplicate pair, and the gap row
    // that has to say which of its projects has no framework.
    await projectRisks.create(ctx, {
      risk_name: "Credit scoring model training data bias",
      risk_description: description,
      risk_category: ["Compliance risk"],
      ai_lifecycle_phase: "Data collection & processing",
      risk_owner: admin.userId,
      projects: [framed.id, bare.id],
      risk_level_autocalculated: "Medium risk",
    });
    await projectRisks.create(ctx, {
      risk_name: "Chatbot answers drift after a vendor model update",
      risk_category: ["Third-party/vendor risk"],
      risk_owner: admin.userId,
      projects: [bare.id],
      risk_level_autocalculated: "Low risk",
    });
  } finally {
    await ctx.request.dispose();
  }
}

setup("authenticate as an admin of an organization that has risks", async ({ page }) => {
  const admin = seedAdminInOrg(ORG_ID, [`--email=${REPORT_ADMIN_EMAIL}`]);
  await seedReportDataIfEmpty(admin);

  await loginAs(page, admin.email, admin.password, /\/(overview)?$/);

  await page.context().storageState({ path: REPORT_AUTH_STATE_PATH });
});
