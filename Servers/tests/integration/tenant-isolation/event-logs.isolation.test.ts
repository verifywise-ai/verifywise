jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestEventLog } from "../../factories";

describe("Event logs tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only event logs in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await createTestEventLog(owner.orgId, owner.userId);

    const ownerList = await owner.request.get("/api/logger/events");
    expect(ownerList.status).toBe(200);
    const ownerItems = Array.isArray(ownerList.body)
      ? ownerList.body
      : (ownerList.body?.data ?? []);
    expect(ownerItems.length).toBeGreaterThan(0);

    const attackerList = await attacker.request.get("/api/logger/events");
    expect(attackerList.status).toBe(200);
    const attackerItems = Array.isArray(attackerList.body)
      ? attackerList.body
      : (attackerList.body?.data ?? []);
    expect(attackerItems.length).toBe(0);
  });
});
