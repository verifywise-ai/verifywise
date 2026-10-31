jest.setTimeout(60000);

/**
 * Which LLM keys the vendor research uses, against the real test database: the endpoints that read
 * and write the choice (Admin only), what the database does when a chosen key is deleted, and the
 * models a run is built with. BullMQ is mocked by ./setup; no model and no web are involved, and
 * `createModelFromKey` only builds a client object, which sends nothing.
 */

import http from "http";
import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
// The harness loads ./setup, which registers the mocks of BullMQ and Redis: keep it before the
// modules that open a queue.
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestApp, testRequest } from "./setup";
import { getVendorResearchSettingsQuery } from "../../utils/vendorResearch.utils";
import { resolveOrgModel } from "../../services/vendorResearch/pipeline";

const SETTINGS = "/api/vendor-research/settings";

afterEach(async () => {
  await cleanupDatabase();
});

/** Inserts a key of the organization and gives its id. The secret is a sentinel to look for. */
async function seedKey(
  orgId: number,
  model: string,
  name: "OpenAI" | "Anthropic" = "OpenAI",
  secret = `sk-SENTINEL-${model}`,
): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO llm_keys (organization_id, key, name, model) VALUES (:orgId, :secret, :name, :model) RETURNING id`,
    { replacements: { orgId, secret, name, model }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

/** A request agent for another role of the same organization and user. */
async function requestAs(role: string, ctx: TenantContext) {
  const app: http.Server = await createTestApp({
    bypassAuth: true,
    mockUser: { userId: ctx.userId, organizationId: ctx.orgId, role },
  });
  return testRequest(app);
}

const rowOf = async (orgId: number) =>
  (
    (await sequelize.query(
      `SELECT * FROM vendor_research_settings WHERE organization_id = :orgId`,
      {
        replacements: { orgId },
        type: QueryTypes.SELECT,
      },
    )) as Array<Record<string, unknown>>
  )[0];

describe("GET /api/vendor-research/settings", () => {
  it("says that nothing is chosen for an organization that has chosen nothing", async () => {
    const { owner } = await seedTwoTenantContexts(1);

    const res = await owner.request.get(SETTINGS);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("gives back what an Admin saved, and never a key", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const research = await seedKey(owner.orgId, "gpt-fast");
    const analysis = await seedKey(owner.orgId, "claude-deep", "Anthropic");
    await owner.request.put(SETTINGS).send({ researchKeyId: research, analysisKeyId: analysis });

    const res = await owner.request.get(SETTINGS);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      researchKeyId: research,
      analysisKeyId: analysis,
      scanIntervalDays: null,
    });
    expect(res.text).not.toContain("sk-SENTINEL");
  });

  it("refuses the roles that do not manage the LLM keys", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    // Positive control: the Admin reads it, so the 403 below is not a missing route.
    expect((await owner.request.get(SETTINGS)).status).toBe(200);

    for (const role of ["Editor", "Reviewer", "Auditor"]) {
      const request = await requestAs(role, owner);
      expect((await request.get(SETTINGS)).status).toBe(403);
    }
  });
});

describe("PUT /api/vendor-research/settings", () => {
  it("saves the two keys for the organization and records who chose", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const research = await seedKey(owner.orgId, "gpt-fast");
    const analysis = await seedKey(owner.orgId, "claude-deep", "Anthropic");

    const res = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: research, analysisKeyId: analysis });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      researchKeyId: research,
      analysisKeyId: analysis,
      scanIntervalDays: null,
    });
    expect(await rowOf(owner.orgId)).toMatchObject({
      organization_id: owner.orgId,
      research_llm_key_id: research,
      analysis_llm_key_id: analysis,
      updated_by: owner.userId,
    });
  });

  it("replaces an earlier choice, and a choice of null gives the default back", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const first = await seedKey(owner.orgId, "gpt-fast");
    const second = await seedKey(owner.orgId, "claude-deep", "Anthropic");
    await owner.request.put(SETTINGS).send({ researchKeyId: first, analysisKeyId: second });

    const replaced = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: second, analysisKeyId: null });
    expect(replaced.body.data).toEqual({
      researchKeyId: second,
      analysisKeyId: null,
      scanIntervalDays: null,
    });

    const reset = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: null, analysisKeyId: null });
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    expect(await getVendorResearchSettingsQuery(owner.orgId)).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("answers 404 for a key of another organization and keeps the earlier choice", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const own = await seedKey(owner.orgId, "gpt-fast");
    const foreign = await seedKey(attacker.orgId, "claude-deep", "Anthropic");
    await owner.request.put(SETTINGS).send({ researchKeyId: own, analysisKeyId: null });

    const res = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: own, analysisKeyId: foreign });

    expect(res.status).toBe(404);
    expect(await getVendorResearchSettingsQuery(owner.orgId)).toEqual({
      researchKeyId: own,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("answers 404 for a key that does not exist", async () => {
    const { owner } = await seedTwoTenantContexts(1);

    const res = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: 999999, analysisKeyId: null });

    expect(res.status).toBe(404);
    expect(await rowOf(owner.orgId)).toBeUndefined();
  });

  it.each([
    ["a missing choice", { researchKeyId: null }],
    ["a key id as text", { researchKeyId: "1", analysisKeyId: null }],
    ["a key id of zero", { researchKeyId: 0, analysisKeyId: null }],
    ["a list", [1, 2]],
  ])("answers 400 for %s and writes nothing", async (_label, body) => {
    const { owner } = await seedTwoTenantContexts(1);

    const res = await owner.request.put(SETTINGS).send(body);

    expect(res.status).toBe(400);
    expect(await rowOf(owner.orgId)).toBeUndefined();
  });

  it("refuses the roles that do not manage the LLM keys, and writes nothing", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const key = await seedKey(owner.orgId, "gpt-fast");
    const body = { researchKeyId: key, analysisKeyId: null };
    // Positive control: the Admin can write, so the 403 below is not a missing route.
    expect((await owner.request.put(SETTINGS).send(body)).status).toBe(200);
    await sequelize.query(`DELETE FROM vendor_research_settings WHERE organization_id = :orgId`, {
      replacements: { orgId: owner.orgId },
    });

    for (const role of ["Editor", "Reviewer", "Auditor"]) {
      const request = await requestAs(role, owner);
      expect((await request.put(SETTINGS).send(body)).status).toBe(403);
    }
    expect(await rowOf(owner.orgId)).toBeUndefined();
  });
});

describe("how often the scan researches a vendor again", () => {
  it("is off for an organization that has chosen nothing", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const key = await seedKey(owner.orgId, "gpt-fast");

    const saved = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: key, analysisKeyId: null });

    expect(saved.body.data.scanIntervalDays).toBeNull();
    expect(await rowOf(owner.orgId)).toMatchObject({ scan_interval_days: null });
  });

  it.each([7, 14, 30])("is saved with the keys, and read back, for %i days", async (days) => {
    const { owner } = await seedTwoTenantContexts(1);
    const key = await seedKey(owner.orgId, "gpt-fast");

    const res = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: key, analysisKeyId: null, scanIntervalDays: days });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      researchKeyId: key,
      analysisKeyId: null,
      scanIntervalDays: days,
    });
    expect(await rowOf(owner.orgId)).toMatchObject({ scan_interval_days: days });
    expect((await owner.request.get(SETTINGS)).body.data).toEqual(res.body.data);
  });

  it("is saved alone, for an organization that has chosen no key", async () => {
    const { owner } = await seedTwoTenantContexts(1);

    const res = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: 7 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: 7,
    });
  });

  // A page that was loaded before the setting existed sends the keys and nothing else: it must not
  // turn the scan off.
  it("is kept when the body does not name it, and null turns the scan off", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const key = await seedKey(owner.orgId, "gpt-fast");
    await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: key, analysisKeyId: null, scanIntervalDays: 14 });

    const keysOnly = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: null, analysisKeyId: null });
    expect(keysOnly.body.data).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: 14,
    });

    const off = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: null });
    expect(off.body.data).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    expect(await rowOf(owner.orgId)).toMatchObject({ scan_interval_days: null });
  });

  it.each([
    ["a number of days that is not offered", 5],
    ["a number that is too big", 31],
    ["zero", 0],
    ["a negative number", -7],
    ["a fraction", 7.5],
    ["text", "7"],
    ["a boolean", true],
    ["a list", [7]],
  ])("answers 400 for %s and writes nothing", async (_label, value) => {
    const { owner } = await seedTwoTenantContexts(1);

    const res = await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: value });

    expect(res.status).toBe(400);
    expect(await rowOf(owner.orgId)).toBeUndefined();
  });

  it("is held to 1 to 365 days by the table, whatever the application allows", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await owner.request
      .put(SETTINGS)
      .send({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: 7 });
    const setTo = (days: number) =>
      sequelize.query(
        `UPDATE vendor_research_settings SET scan_interval_days = :days WHERE organization_id = :orgId`,
        { replacements: { days, orgId: owner.orgId } },
      );

    await expect(setTo(0)).rejects.toMatchObject({ parent: { code: "23514" } });
    await expect(setTo(366)).rejects.toMatchObject({ parent: { code: "23514" } });
    await setTo(1);
    await setTo(365);
    expect(await rowOf(owner.orgId)).toMatchObject({ scan_interval_days: 365 });
  });
});

describe("what a run is built with", () => {
  it("uses the newest key for both when nothing is chosen", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedKey(owner.orgId, "older-model");
    // Keys are ordered by their creation time, newest first: leave a gap between the two.
    await sequelize.query(
      `UPDATE llm_keys SET created_at = NOW() - INTERVAL '1 hour' WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId } },
    );
    await seedKey(owner.orgId, "newest-model");

    const resolved = await resolveOrgModel(owner.orgId);

    expect(resolved?.modelId).toBe("newest-model");
    expect(resolved).not.toHaveProperty("analysis");
  });

  it("uses the keys the Admin chose, one for the research and one for the analysis", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const fast = await seedKey(owner.orgId, "gpt-fast");
    const deep = await seedKey(owner.orgId, "claude-deep", "Anthropic");
    await seedKey(owner.orgId, "newest-model");
    await owner.request.put(SETTINGS).send({ researchKeyId: fast, analysisKeyId: deep });

    const resolved = await resolveOrgModel(owner.orgId);

    expect(resolved?.modelId).toBe("gpt-fast");
    expect(resolved?.analysis?.modelId).toBe("claude-deep");
  });

  it("falls back to the newest key when the chosen key is deleted, and empties the choice", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const chosen = await seedKey(owner.orgId, "gpt-fast");
    await seedKey(owner.orgId, "newest-model");
    await owner.request.put(SETTINGS).send({ researchKeyId: chosen, analysisKeyId: null });

    await sequelize.query(`DELETE FROM llm_keys WHERE id = :chosen`, { replacements: { chosen } });

    expect(await getVendorResearchSettingsQuery(owner.orgId)).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    expect((await resolveOrgModel(owner.orgId))?.modelId).toBe("newest-model");
  });

  it("builds no model for an organization without a key, whatever its row says", async () => {
    const { owner } = await seedTwoTenantContexts(1);

    expect(await resolveOrgModel(owner.orgId)).toBeNull();
  });
});

describe("the table", () => {
  it("goes with the organization", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const key = await seedKey(owner.orgId, "gpt-fast");
    await owner.request.put(SETTINGS).send({ researchKeyId: key, analysisKeyId: null });
    expect(await rowOf(owner.orgId)).toBeDefined();

    await sequelize.query(`DELETE FROM organizations WHERE id = :orgId`, {
      replacements: { orgId: owner.orgId },
    });

    expect(await rowOf(owner.orgId)).toBeUndefined();
  });
});
