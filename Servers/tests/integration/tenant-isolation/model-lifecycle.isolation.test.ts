jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { createTestModelInventory } from "../../factories";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

const ROUTE = "/api/extensions/model-lifecycle";

async function enableModelLifecycle(orgId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_enablements (organization_id, extension_id, enabled, enabled_at, enabled_by)
     SELECT :orgId, e.id, TRUE, now(), :userId FROM extensions e WHERE e.key = 'model-lifecycle'
     ON CONFLICT (organization_id, extension_id) DO UPDATE SET enabled = TRUE, enabled_at = now();`,
    { replacements: { orgId, userId } },
  );
}

/** A phase with one item, created through the API by the organization's Admin. */
async function seedItem(ctx: TenantContext): Promise<number> {
  const phase = await ctx.request.post(`${ROUTE}/phases`).send({ name: "Build" });
  expect(phase.status).toBe(201);
  const item = await ctx.request
    .post(`${ROUTE}/phases/${phase.body.data.id}/items`)
    .send({ name: "Owner notes", item_type: "text" });
  expect(item.status).toBe(201);
  return item.body.data.id as number;
}

const count = async (sql: string, replacements: Record<string, unknown>): Promise<number> => {
  const [row] = (await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  })) as Array<{ n: number }>;
  return row.n;
};

const valuesFor = (modelId: number) =>
  count(
    `SELECT COUNT(*)::int AS n FROM model_lifecycle_values WHERE model_inventory_id = :modelId`,
    {
      modelId,
    },
  );

/**
 * model_lifecycle_phases, _items, _values, _item_files, _item_people,
 * _item_approvals and _change_history behind /api/extensions/model-lifecycle.
 * Setup rows are keyed by the caller's organization; every per-model row is
 * reached through a model and an item, which must both be in the caller's
 * organization, and people and approvers must be its members.
 */
describe("model lifecycle tenant isolation", () => {
  afterEach(cleanupDatabase);

  async function setup() {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableModelLifecycle(owner.orgId, owner.userId);
    await enableModelLifecycle(attacker.orgId, attacker.userId);
    const ownerModel = await createTestModelInventory(owner.orgId);
    const attackerModel = await createTestModelInventory(attacker.orgId);
    const ownerItem = await seedItem(owner);
    const attackerItem = await seedItem(attacker);
    return { owner, attacker, ownerModel, attackerModel, ownerItem, attackerItem };
  }

  it("answers 404 for another organization's model on every per-model route", async () => {
    const { owner, attacker, ownerModel, ownerItem, attackerItem } = await setup();

    // The owner's answer exists, so a 404 below is isolation, not an empty table.
    const own = await owner.request
      .put(`${ROUTE}/models/${ownerModel}/lifecycle/items/${ownerItem}`)
      .send({ value_text: "Owner answer" });
    expect(own.status).toBe(200);

    const base = `${ROUTE}/models/${ownerModel}/lifecycle`;
    const item = `${base}/items/${attackerItem}`;
    const attempts = [
      attacker.request.get(base),
      attacker.request.get(`${base}/progress`),
      attacker.request.put(item).send({ value_text: "Overwritten" }),
      attacker.request.post(`${item}/people`).send({ userId: attacker.userId }),
      attacker.request.post(`${item}/approvals`).send({ userId: attacker.userId }),
      attacker.request.put(`${item}/approvals/${attacker.userId}`).send({ status: "approved" }),
      attacker.request.delete(`${item}/people/${owner.userId}`),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404);
    }

    expect(await valuesFor(ownerModel)).toBe(1);
    const [row] = (await sequelize.query(
      `SELECT value_text, organization_id FROM model_lifecycle_values WHERE model_inventory_id = :ownerModel`,
      { replacements: { ownerModel }, type: QueryTypes.SELECT },
    )) as Array<{ value_text: string; organization_id: number }>;
    expect(row).toEqual({ value_text: "Owner answer", organization_id: owner.orgId });
  });

  it("answers 404, not a foreign-key 500, for a model id that does not exist", async () => {
    const { owner, ownerItem } = await setup();

    const res = await owner.request
      .put(`${ROUTE}/models/999999/lifecycle/items/${ownerItem}`)
      .send({ value_text: "x" });

    expect(res.status).toBe(404);
    expect(await valuesFor(999999)).toBe(0);
  });

  it("answers 404 for another organization's item on the caller's own model", async () => {
    const { owner, attacker, attackerModel, ownerItem } = await setup();

    const item = `${ROUTE}/models/${attackerModel}/lifecycle/items/${ownerItem}`;
    const attempts = [
      attacker.request.put(item).send({ value_text: "Planted" }),
      attacker.request.post(`${item}/people`).send({ userId: attacker.userId }),
      attacker.request.post(`${item}/approvals`).send({ userId: attacker.userId }),
      attacker.request.post(`${item}/files`).send({ fileId: 1 }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404);
    }

    expect(await valuesFor(attackerModel)).toBe(0);
    expect(
      await count(
        `SELECT COUNT(*)::int AS n FROM model_lifecycle_values WHERE item_id = :ownerItem`,
        { ownerItem },
      ),
    ).toBe(0);
    // The owner's item is still the owner's.
    expect(
      await count(
        `SELECT COUNT(*)::int AS n FROM model_lifecycle_items WHERE id = :ownerItem AND organization_id = :orgId`,
        { ownerItem, orgId: owner.orgId },
      ),
    ).toBe(1);
  });

  it("rejects a person or approver from another organization with 400", async () => {
    const { owner, attacker, ownerModel, ownerItem } = await setup();
    const item = `${ROUTE}/models/${ownerModel}/lifecycle/items/${ownerItem}`;

    const person = await owner.request.post(`${item}/people`).send({ userId: attacker.userId });
    expect(person.status).toBe(400);
    const approver = await owner.request
      .post(`${item}/approvals`)
      .send({ userId: attacker.userId });
    expect(approver.status).toBe(400);

    expect(
      await count(
        `SELECT COUNT(*)::int AS n FROM model_lifecycle_item_people WHERE user_id = :userId`,
        { userId: attacker.userId },
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT COUNT(*)::int AS n FROM model_lifecycle_item_approvals WHERE user_id = :userId`,
        { userId: attacker.userId },
      ),
    ).toBe(0);

    // A member of the organization is still accepted.
    const own = await owner.request.post(`${item}/approvals`).send({ userId: owner.userId });
    expect(own.status).toBe(201);
    expect(own.body.data).toEqual(expect.objectContaining({ user_id: owner.userId }));
  });

  it("never lists another organization's lifecycle setup", async () => {
    const { owner, attacker } = await setup();

    for (const ctx of [owner, attacker]) {
      const config = await ctx.request.get(`${ROUTE}/config`);
      expect(config.status).toBe(200);
      expect(config.body.data).toHaveLength(1);
    }
    expect(
      await count(
        `SELECT COUNT(*)::int AS n FROM model_lifecycle_phases WHERE organization_id = :orgId`,
        { orgId: owner.orgId },
      ),
    ).toBe(1);
  });
});
