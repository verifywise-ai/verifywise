jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestAuditLedger } from "../../factories";

describe("Audit ledger tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only audit ledger entries in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await createTestAuditLedger(owner.orgId, owner.userId);

    const ownerList = await owner.request.get("/api/audit-ledger");
    expect(ownerList.status).toBe(200);
    const ownerEntries = ownerList.body?.data?.entries ?? [];
    expect(ownerEntries.length).toBeGreaterThan(0);

    const attackerList = await attacker.request.get("/api/audit-ledger");
    expect(attackerList.status).toBe(200);
    const attackerEntries = attackerList.body?.data?.entries ?? [];
    expect(attackerEntries.length).toBe(0);
  });
});
