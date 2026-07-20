jest.setTimeout(60000);

import { cleanupDatabase, createTestUser } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

describe("Users tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only users in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const uniqueEmail = `owner-user-${Date.now()}@test.com`;
    await createTestUser(owner.orgId, 1, uniqueEmail, "Password123!");

    const ownerList = await owner.request.get("/api/users");
    expect([200, 204]).toContain(ownerList.status);
    const ownerEmails = (ownerList.body?.data ?? []).map((u: any) => u.email);
    expect(ownerEmails).toContain(uniqueEmail);

    const attackerList = await attacker.request.get("/api/users");
    expect([200, 204]).toContain(attackerList.status);
    const attackerEmails = (attackerList.body?.data ?? []).map((u: any) => u.email);
    expect(attackerEmails).not.toContain(uniqueEmail);
  });

  it("denies cross-tenant get, update, and delete with 403", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const uniqueEmail = `owner-user-${Date.now()}@test.com`;
    const userId = await createTestUser(owner.orgId, 1, uniqueEmail, "Password123!");

    const getRes = await attacker.request.get(`/api/users/${userId}`);
    expect(getRes.status).toBe(403);

    const patchRes = await attacker.request.patch(`/api/users/${userId}`).send({ name: "Updated" });
    expect(patchRes.status).toBe(403);

    const deleteRes = await attacker.request.delete(`/api/users/${userId}`);
    expect(deleteRes.status).toBe(403);
  });
});
