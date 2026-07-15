import { createTestApp, testRequest } from "./setup";
import {
  createTestOrganization,
  createTestUser,
  createTestVendor,
  cleanupDatabase,
} from "./helpers";

describe("Vendor tenant isolation", () => {
  let orgA: number;
  let orgB: number;
  let userA: number;
  let userB: number;

  beforeEach(async () => {
    orgA = await createTestOrganization("Tenant A");
    orgB = await createTestOrganization("Tenant B");
    userA = await createTestUser(orgA, 1, "admin-a@test.com", "Password123!");
    userB = await createTestUser(orgB, 1, "admin-b@test.com", "Password123!");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("allows a user to read and update their own organization's vendor", async () => {
    const app = createTestApp({
      bypassAuth: true,
      mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
    });

    const vendorId = await createTestVendor(orgA, userA, {
      vendor_name: "Org A Vendor",
    });

    const getRes = await testRequest(app).get(`/api/vendors/${vendorId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.vendor_name).toBe("Org A Vendor");

    const patchRes = await testRequest(app)
      .patch(`/api/vendors/${vendorId}`)
      .send({ vendor_name: "Org A Vendor Updated" });
    expect(patchRes.status).toBe(202);
    expect(patchRes.body.data.vendor_name).toBe("Org A Vendor Updated");
  });

  it("hides another organization's vendor from list and detail views", async () => {
    const appA = createTestApp({
      bypassAuth: true,
      mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
    });
    const appB = createTestApp({
      bypassAuth: true,
      mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
    });

    const vendorId = await createTestVendor(orgA, userA, {
      vendor_name: "Org A Vendor",
    });

    // Owner org can see it
    const ownerListRes = await testRequest(appA).get("/api/vendors");
    expect(ownerListRes.status).toBe(200);
    expect(ownerListRes.body.data.map((v: any) => v.id)).toContain(vendorId);

    // Other org cannot
    const listRes = await testRequest(appB).get("/api/vendors");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.map((v: any) => v.id)).not.toContain(vendorId);

    const detailRes = await testRequest(appB).get(`/api/vendors/${vendorId}`);
    expect(detailRes.status).toBe(404);
  });

  it("prevents users from updating or deleting another organization's vendor", async () => {
    const appB = createTestApp({
      bypassAuth: true,
      mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
    });

    const vendorId = await createTestVendor(orgA, userA, {
      vendor_name: "Org A Vendor",
    });

    const patchRes = await testRequest(appB)
      .patch(`/api/vendors/${vendorId}`)
      .send({ vendor_name: "Hijacked Vendor" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await testRequest(appB).delete(`/api/vendors/${vendorId}`);
    expect(deleteRes.status).toBe(404);

    // Verify the vendor still exists for org A
    const appA = createTestApp({
      bypassAuth: true,
      mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
    });
    const getRes = await testRequest(appA).get(`/api/vendors/${vendorId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.vendor_name).toBe("Org A Vendor");
  });
});
