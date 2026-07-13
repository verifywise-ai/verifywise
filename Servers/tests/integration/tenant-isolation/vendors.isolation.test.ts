jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts, assertCreateStampsCallerOrg } from "./tenantIsolation.harness";
import { createTestVendor } from "../../factories";

const ROUTES = {
  list: "/api/vendors",
  get: (id: number) => `/api/vendors/${id}`,
  create: "/api/vendors",
  update: (id: number) => `/api/vendors/${id}`,
  delete: (id: number) => `/api/vendors/${id}`,
};

describe("Vendors tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only vendors in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    await createTestVendor(owner.orgId);

    const ownerList = await owner.request.get(ROUTES.list);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body?.data?.length ?? 0).toBeGreaterThan(0);

    const attackerList = await attacker.request.get(ROUTES.list);
    // The vendor endpoint returns 204 when no vendors exist, but Jest/supertest
    // still exposes the parsed body as an empty object.
    expect([200, 204]).toContain(attackerList.status);
    expect(attackerList.body?.data?.length ?? 0).toBe(0);
  });

  it("denies cross-tenant read, update, and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);

    const getRes = await attacker.request.get(ROUTES.get(vendorId));
    expect(getRes.status).toBe(404);

    const patchRes = await attacker.request
      .patch(ROUTES.update(vendorId))
      .send({ vendor_name: "Hacked" });
    expect([404, 403]).toContain(patchRes.status);

    const deleteRes = await attacker.request.delete(ROUTES.delete(vendorId));
    expect([404, 403]).toContain(deleteRes.status);
  });

  it("stamps the caller's organization_id on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertCreateStampsCallerOrg(
      owner,
      attacker.orgId,
      { create: ROUTES.create },
      () => ({
        vendor_name: "Cross-tenant vendor",
        vendor_provides: "Services",
        website: "https://example.com",
        vendor_contact_person: "Contact Person",
        assignee: owner.userId,
      }),
      "vendors",
      (res) => res.body?.data?.id,
    );
  });
});
