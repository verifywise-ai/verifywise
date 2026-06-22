import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const TEST_EMAIL = "smoke@test.com";
const TEST_PASSWORD = "SmokePass123!";

describe("POST /api/users/login", () => {
  beforeEach(async () => {
    const orgId = await createTestOrganization();
    await createTestUser(orgId, 1, TEST_EMAIL, TEST_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns 202 + token for valid credentials", async () => {
    const app = createTestApp();
    const res = await testRequest(app)
      .post("/api/users/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(202);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe("string");
  });

  it("returns 401 for wrong password", async () => {
    const app = createTestApp();
    const res = await testRequest(app)
      .post("/api/users/login")
      .send({ email: TEST_EMAIL, password: "WrongPass999!" });

    expect(res.status).toBe(401);
  });

  it("returns 401 for nonexistent email", async () => {
    const app = createTestApp();
    const res = await testRequest(app)
      .post("/api/users/login")
      .send({ email: "ghost@test.com", password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });
});
