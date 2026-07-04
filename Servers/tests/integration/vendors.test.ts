import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const ADMIN_EMAIL = "vendor-admin@test.com";
const ADMIN_PASSWORD = "VendorAdmin1!";

describe("Vendors API", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  const validVendorPayload = {
    vendor_name: "Test Vendor Inc",
    vendor_provides: "AI Model Evaluation Services",
    website: "https://testvendor.example.com",
    vendor_contact_person: "John Doe",
  };

  describe("POST /api/vendors", () => {
    it("creates a vendor with bypassAuth (201)", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId });

      expect(res.status).toBe(201);
      expect(res.body.data.vendor_name).toBe("Test Vendor Inc");
      expect(res.body.data.assignee).toBe(userId);
    });

    it("creates a vendor with real JWT from login (201)", async () => {
      const app = createTestApp();

      const loginRes = await testRequest(app)
        .post("/api/users/login")
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      expect(loginRes.status).toBe(202);
      const token = loginRes.body.data.token;

      const res = await testRequest(app)
        .post("/api/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validVendorPayload, assignee: userId });

      expect(res.status).toBe(201);
      expect(res.body.data.vendor_name).toBe("Test Vendor Inc");
    });

    it("returns 400 for missing required assignee", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/vendors")
        .send({ vendor_name: "Incomplete Vendor" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/vendors", () => {
    it("returns empty list when no vendors exist", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app).get("/api/vendors");

      expect([200, 204]).toContain(res.status);
    });

    it("returns created vendor in list", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId });

      const res = await testRequest(app).get("/api/vendors");

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.map((v: any) => v.vendor_name)).toContain("Test Vendor Inc");
    });
  });
});
