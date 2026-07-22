import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

jest.setTimeout(20000);

const SETUP_EMAIL = "setup-admin@test.com";
const SETUP_PASSWORD = "SetupPass123!";

describe("POST /api/organizations/setup", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("creates the first organization and admin on a fresh system", async () => {
    await cleanupDatabase();
    const app = createTestApp();

    const res = await testRequest(app).post("/api/organizations/setup").send({
      name: "First Org",
      userEmail: SETUP_EMAIL,
      userName: "Admin",
      userSurname: "User",
      userPassword: SETUP_PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.organization).toBeDefined();
    expect(res.body.data.organization.name).toBe("First Org");
    expect(res.body.data.user.email).toBe(SETUP_EMAIL);
    expect(res.body.data.token).toBeDefined();
  });

  it("returns 403 when the system is already initialized", async () => {
    const orgId = await createTestOrganization();
    await createTestUser(orgId, 1, SETUP_EMAIL, SETUP_PASSWORD);

    const app = createTestApp();
    const res = await testRequest(app).post("/api/organizations/setup").send({
      name: "Second Org",
      userEmail: "another@test.com",
      userName: "Another",
      userSurname: "User",
      userPassword: SETUP_PASSWORD,
    });

    expect(res.status).toBe(403);
  });
});
