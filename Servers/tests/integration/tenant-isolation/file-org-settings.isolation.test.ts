jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { getFileOrgSettings, upsertFileOrgSettings } from "../../../utils/fileOrgSettings.utils";

/**
 * file_org_settings — tenant isolation + defaults + partial-update guard.
 *
 * The org-wide default retention policy applied at file upload time. Rules:
 *   (a) A missing settings row resolves to defaults ({ default_retention_policy: null })
 *       — never leaks another org's row.
 *   (b) An upsert against org A never touches org B's row.
 *   (c) PARTIAL semantics: fields absent from the update payload keep their
 *       stored value. default_retention_policy explicitly set to null clears
 *       the org default (the "provided" flag distinguishes clear-to-null from
 *       don't-touch).
 */
describe("file_org_settings tenant isolation + partial-update guard", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns defaults when no settings row exists and scopes upserts per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    // Both orgs start with defaults — no row, no leak.
    const ownerBefore = await getFileOrgSettings(owner.orgId);
    expect(ownerBefore.default_retention_policy).toBeNull();
    expect(ownerBefore.organization_id).toBe(owner.orgId);

    const attackerBefore = await getFileOrgSettings(attacker.orgId);
    expect(attackerBefore.default_retention_policy).toBeNull();
    expect(attackerBefore.organization_id).toBe(attacker.orgId);

    // Owner sets a default.
    await upsertFileOrgSettings(owner.orgId, { default_retention_policy: "1_year" });
    const ownerAfter = await getFileOrgSettings(owner.orgId);
    expect(ownerAfter.default_retention_policy).toBe("1_year");

    // Attacker still sees defaults — the write was org-scoped.
    const attackerAfter = await getFileOrgSettings(attacker.orgId);
    expect(attackerAfter.default_retention_policy).toBeNull();
    expect(attackerAfter.organization_id).toBe(attacker.orgId);
  });

  it("clears the org default when default_retention_policy is explicitly set to null", async () => {
    const { owner } = await seedTwoTenantContexts();

    await upsertFileOrgSettings(owner.orgId, { default_retention_policy: "3_years" });
    expect((await getFileOrgSettings(owner.orgId)).default_retention_policy).toBe("3_years");

    // Explicit null clears — the "provided" flag distinguishes this from an
    // empty update that should be a no-op.
    await upsertFileOrgSettings(owner.orgId, { default_retention_policy: null });
    expect((await getFileOrgSettings(owner.orgId)).default_retention_policy).toBeNull();
  });

  it("partial update with no fields is a no-op (does not overwrite existing values)", async () => {
    const { owner } = await seedTwoTenantContexts();

    await upsertFileOrgSettings(owner.orgId, { default_retention_policy: "6_months" });
    expect((await getFileOrgSettings(owner.orgId)).default_retention_policy).toBe("6_months");

    // Empty update — the CASE guard should keep the existing value.
    await upsertFileOrgSettings(owner.orgId, {});
    expect((await getFileOrgSettings(owner.orgId)).default_retention_policy).toBe("6_months");
  });

  it("owner's upsert never touches attacker's row (two orgs, both configured)", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    // Seed both orgs with different defaults.
    await upsertFileOrgSettings(owner.orgId, { default_retention_policy: "30_days" });
    await upsertFileOrgSettings(attacker.orgId, { default_retention_policy: "5_years" });

    // Owner flips its own value.
    await upsertFileOrgSettings(owner.orgId, { default_retention_policy: "indefinite" });

    // Both values are what each org set — no cross-tenant bleed.
    expect((await getFileOrgSettings(owner.orgId)).default_retention_policy).toBe("indefinite");
    expect((await getFileOrgSettings(attacker.orgId)).default_retention_policy).toBe("5_years");
  });
});
