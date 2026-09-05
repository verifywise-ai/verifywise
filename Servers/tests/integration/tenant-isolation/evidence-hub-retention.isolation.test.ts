jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestEvidenceHub } from "../../factories";
import { runEvidenceExpirySweep } from "../../../services/automations/actions/evidenceExpirySweep";
import {
  getEvidenceHubOrgSettings,
  upsertEvidenceHubOrgSettings,
} from "../../../utils/evidenceHubSettings.utils";

/**
 * Evidence Hub retention — tenant isolation.
 *
 * Org settings (default retention period, archival opt-in) must be scoped to
 * the caller's org with a defaults fallback, and the daily expiry sweep for
 * one org must never flag another org's evidence.
 */

describe("Evidence Hub retention tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns defaults when no settings row exists and scopes upserts per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const before = await getEvidenceHubOrgSettings(owner.orgId);
    expect(before.default_retention_period).toBeNull();
    expect(before.archive_on_expiry).toBe(false);

    await upsertEvidenceHubOrgSettings(owner.orgId, { default_retention_period: "1_year" });
    const ownerAfter = await getEvidenceHubOrgSettings(owner.orgId);
    expect(ownerAfter.default_retention_period).toBe("1_year");

    // The other org still sees defaults — settings are org-scoped.
    const attackerView = await getEvidenceHubOrgSettings(attacker.orgId);
    expect(attackerView.default_retention_period).toBeNull();
    expect(attackerView.archive_on_expiry).toBe(false);

    // A partial update never touches unset fields.
    await upsertEvidenceHubOrgSettings(owner.orgId, { archive_on_expiry: true });
    const partial = await getEvidenceHubOrgSettings(owner.orgId);
    expect(partial.default_retention_period).toBe("1_year");
    expect(partial.archive_on_expiry).toBe(true);
  });

  it("scopes the settings endpoints to the caller's org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await upsertEvidenceHubOrgSettings(owner.orgId, { default_retention_period: "90_days" });

    // The attacker sees their own (default) settings, not the owner's.
    const attackerGet = await attacker.request.get("/api/evidenceHub/settings");
    expect(attackerGet.status).toBe(200);
    const attackerSettings = attackerGet.body?.data ?? attackerGet.body;
    expect(attackerSettings.default_retention_period).toBeNull();

    // The attacker's write lands on their own org and leaves the owner's intact.
    const attackerPut = await attacker.request
      .put("/api/evidenceHub/settings")
      .send({ default_retention_period: "7_years" });
    expect(attackerPut.status).toBe(200);

    const ownerAfter = await getEvidenceHubOrgSettings(owner.orgId);
    expect(ownerAfter.default_retention_period).toBe("90_days");
  });

  it("org A's expiry sweep never flags org B's evidence", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerExpired = await createTestEvidenceHub(owner.orgId);
    const attackerExpired = await createTestEvidenceHub(attacker.orgId);
    await sequelize.query(
      `UPDATE evidence_hub
          SET expiry_date = now() - interval '1 day'
        WHERE id IN (:ownerId, :attackerId)`,
      { replacements: { ownerId: ownerExpired, attackerId: attackerExpired } },
    );

    const { summary } = await runEvidenceExpirySweep(owner.orgId);
    expect(summary.newly_expired).toBe(1);

    const rows = (await sequelize.query(`SELECT id, expired_at FROM evidence_hub ORDER BY id`, {
      type: QueryTypes.SELECT,
    })) as { id: number; expired_at: string | null }[];
    const ownerRow = rows.find((r) => r.id === ownerExpired);
    const attackerRow = rows.find((r) => r.id === attackerExpired);
    expect(ownerRow?.expired_at).not.toBeNull();
    expect(attackerRow?.expired_at).toBeNull();
  });
});
