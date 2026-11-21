jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  getVendorResearchSettingsQuery,
  saveVendorResearchSettingsQuery,
} from "../../../utils/vendorResearch.utils";

const SETTINGS = "/api/v1/vendor-research/settings";

const seedKey = async (orgId: number, model: string): Promise<number> => {
  const rows = (await sequelize.query(
    `INSERT INTO llm_keys (organization_id, key, name, model) VALUES (:orgId, :secret, 'OpenAI', :model) RETURNING id`,
    { replacements: { orgId, model, secret: `sk-SENTINEL-${model}` }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0].id;
};

const rowCount = async (orgId: number): Promise<number> =>
  (
    (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM vendor_research_settings WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as Array<{ count: number }>
  )[0].count;

/**
 * vendor_research_settings — the keys an organization chose for its research are read, written and
 * used only for that organization, and a key of another organization can never be named in them.
 */
describe("vendor_research_settings tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("reads the choice of the owning organization only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const key = await seedKey(owner.orgId, "gpt-fast");
    await owner.request.put(SETTINGS).send({ researchKeyId: key, analysisKeyId: null });

    // Positive controls first, so a broken query cannot pass as "isolated".
    expect(await getVendorResearchSettingsQuery(owner.orgId)).toEqual({
      researchKeyId: key,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    expect((await owner.request.get(SETTINGS)).body.data).toEqual({
      researchKeyId: key,
      analysisKeyId: null,
      scanIntervalDays: null,
    });

    // The other organization has chosen nothing, and sees nothing of the owner's choice.
    expect(await getVendorResearchSettingsQuery(attacker.orgId)).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    const res = await attacker.request.get(SETTINGS);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    expect(res.text).not.toContain(String(key) + ",");
  });

  it("does not let another organization change or clear a choice", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const ownerKey = await seedKey(owner.orgId, "gpt-fast");
    const attackerKey = await seedKey(attacker.orgId, "claude-deep");
    await owner.request.put(SETTINGS).send({ researchKeyId: ownerKey, analysisKeyId: null });

    // The attacker writes its own choice, and writes it for itself.
    const saved = await attacker.request
      .put(SETTINGS)
      .send({ researchKeyId: attackerKey, analysisKeyId: null });
    expect(saved.status).toBe(200);
    expect(await getVendorResearchSettingsQuery(owner.orgId)).toEqual({
      researchKeyId: ownerKey,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    expect(await getVendorResearchSettingsQuery(attacker.orgId)).toEqual({
      researchKeyId: attackerKey,
      analysisKeyId: null,
      scanIntervalDays: null,
    });

    // Resetting its own choice leaves the owner's alone.
    await attacker.request.put(SETTINGS).send({ researchKeyId: null, analysisKeyId: null });
    expect(await getVendorResearchSettingsQuery(owner.orgId)).toEqual({
      researchKeyId: ownerKey,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("refuses to name a key of another organization, over the API", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const ownerKey = await seedKey(owner.orgId, "gpt-fast");

    for (const body of [
      { researchKeyId: ownerKey, analysisKeyId: null },
      { researchKeyId: null, analysisKeyId: ownerKey },
    ]) {
      const res = await attacker.request.put(SETTINGS).send(body);
      expect(res.status).toBe(404);
    }
    expect(await rowCount(attacker.orgId)).toBe(0);
    // A key that is the owner's is still the owner's to name.
    const ok = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: ownerKey, analysisKeyId: null });
    expect(ok.status).toBe(200);
  });

  it("stores no key of another organization even when the caller did not check", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const ownerKey = await seedKey(owner.orgId, "gpt-fast");
    const attackerKey = await seedKey(attacker.orgId, "claude-deep");

    // The query itself, called with the owner's key id for the attacker's organization.
    const stored = await sequelize.transaction((transaction) =>
      saveVendorResearchSettingsQuery(
        {
          organizationId: attacker.orgId,
          userId: attacker.userId,
          researchKeyId: ownerKey,
          analysisKeyId: attackerKey,
        },
        transaction,
      ),
    );

    expect(stored).toEqual({
      researchKeyId: null,
      analysisKeyId: attackerKey,
      scanIntervalDays: null,
    });
    expect(await getVendorResearchSettingsQuery(attacker.orgId)).toEqual(stored);
  });
});
