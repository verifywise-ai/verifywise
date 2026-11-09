jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

describe("AI app change history tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns only AI app change history in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const [rows] = await sequelize.query(
      `INSERT INTO ai_apps (organization_id, name, owner_id, status)
       VALUES (:orgId, :name, :userId, 'approved') RETURNING id`,
      { replacements: { orgId: owner.orgId, userId: owner.userId, name: `App ${Date.now()}` } },
    );
    const appId = Number((rows as any[])[0].id);

    // Going live writes ai_app_change_history rows through changeHistory.base.utils.
    const goLive = await owner.request
      .post(`/api/v1/ai-app-lifecycle/${appId}/go-live`)
      .send({ go_live_date: "2026-02-01" });
    expect(goLive.status).toBe(200);

    const ownerRes = await owner.request.get(`/api/v1/ai-app-lifecycle/${appId}/history`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.data.length).toBeGreaterThan(0);

    const attackerRes = await attacker.request.get(`/api/v1/ai-app-lifecycle/${appId}/history`);
    expect(attackerRes.status).toBe(200);
    expect(attackerRes.body.data.data).toEqual([]);
  });
});
