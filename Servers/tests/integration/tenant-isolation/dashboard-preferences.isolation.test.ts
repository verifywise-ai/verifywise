jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestUser } from "../helpers";
import { createTestApp, testRequest } from "../setup";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

const ROUTE = "/api/v1/dashboard/preferences";
const layoutOf = (widgetKey: string) => [{ widgetKey, visible: false, position: 0 }];

const storedRows = () =>
  sequelize.query<{ user_id: number; organization_id: number; layout: unknown }>(
    `SELECT user_id, organization_id, layout FROM dashboard_preferences ORDER BY user_id`,
    { type: QueryTypes.SELECT },
  );

/**
 * dashboard_preferences is per user AND per organization; the JWT alone picks
 * the row, so neither another tenant nor a request body can reach it.
 */
describe("Dashboard preferences tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("answers null for a user who has saved nothing", async () => {
    const { owner } = await seedTwoTenantContexts();
    const res = await owner.request.get(ROUTE);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ layout: null, updated_at: null });
  });

  it("never shows one organization's layout to another", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const saved = await owner.request
      .put(ROUTE)
      .send({ layout: layoutOf("operations.task-radar") });
    expect(saved.status).toBe(200);
    expect(saved.body.data.layout).toEqual(layoutOf("operations.task-radar"));

    const ownerRes = await owner.request.get(ROUTE);
    expect(ownerRes.body.data.layout).toEqual(layoutOf("operations.task-radar"));

    const attackerRes = await attacker.request.get(ROUTE);
    expect(attackerRes.status).toBe(200);
    expect(attackerRes.body.data.layout).toBeNull();
  });

  it("keeps each tenant's write on its own row", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await owner.request.put(ROUTE).send({ layout: layoutOf("operations.task-radar") });
    await attacker.request.put(ROUTE).send({ layout: layoutOf("executive.model-risks") });

    expect((await owner.request.get(ROUTE)).body.data.layout).toEqual(
      layoutOf("operations.task-radar"),
    );
    expect((await attacker.request.get(ROUTE)).body.data.layout).toEqual(
      layoutOf("executive.model-risks"),
    );
    expect(await storedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: owner.userId, organization_id: owner.orgId }),
        expect.objectContaining({ user_id: attacker.userId, organization_id: attacker.orgId }),
      ]),
    );
    expect(await storedRows()).toHaveLength(2);
  });

  it("ignores another user or organization named in the body", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const res = await attacker.request.put(ROUTE).send({
      layout: layoutOf("operations.task-radar"),
      user_id: owner.userId,
      organization_id: owner.orgId,
    });
    expect(res.status).toBe(200);

    expect((await owner.request.get(ROUTE)).body.data.layout).toBeNull();
    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: attacker.userId, organization_id: attacker.orgId });
  });

  it("keeps two users of the same organization apart", async () => {
    const { owner } = await seedTwoTenantContexts();
    const colleagueId = await createTestUser(
      owner.orgId,
      1,
      `colleague-${Date.now()}@test.com`,
      "Password123!",
    );
    const colleagueApp = await createTestApp({
      bypassAuth: true,
      mockUser: { userId: colleagueId, organizationId: owner.orgId, role: "Admin" },
    });
    const colleague = testRequest(colleagueApp);

    await owner.request.put(ROUTE).send({ layout: layoutOf("operations.task-radar") });
    expect((await colleague.get(ROUTE)).body.data.layout).toBeNull();

    await colleague.put(ROUTE).send({ layout: layoutOf("executive.model-risks") });
    expect((await owner.request.get(ROUTE)).body.data.layout).toEqual(
      layoutOf("operations.task-radar"),
    );
    expect((await colleague.get(ROUTE)).body.data.layout).toEqual(
      layoutOf("executive.model-risks"),
    );
  });

  it("replaces the row on a second save instead of adding one", async () => {
    const { owner } = await seedTwoTenantContexts();
    await owner.request.put(ROUTE).send({ layout: layoutOf("operations.task-radar") });
    await owner.request.put(ROUTE).send({ layout: layoutOf("operations.model-risks") });

    expect((await owner.request.get(ROUTE)).body.data.layout).toEqual(
      layoutOf("operations.model-risks"),
    );
    expect(await storedRows()).toHaveLength(1);
  });
});
