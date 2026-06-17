import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, seedFrameworks, cleanupDatabase } from "./helpers";

const ADMIN_EMAIL = "project-admin@test.com";
const ADMIN_PASSWORD = "ProjAdmin1!";

describe("POST /api/projects", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
    await seedFrameworks();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  const validPayload = {
    project_title: "Smoke Test Project",
    owner: 1,
    start_date: "2024-06-01",
    geography: 1,
    framework: [],
    members: [],
  };

  it("creates a project with bypassAuth (201)", async () => {
    const app = createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    });

    const res = await testRequest(app).post("/api/projects").send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.project.project_title).toBe("Smoke Test Project");
  });

  it("creates a project with real JWT from login (201)", async () => {
    const app = createTestApp();

    const loginRes = await testRequest(app)
      .post("/api/users/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(loginRes.status).toBe(202);
    const token = loginRes.body.data.token;

    const res = await testRequest(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.project.project_title).toBe("Smoke Test Project");
  });

  it("returns error for missing project_title", async () => {
    const app = createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    });

    const { project_title, ...incompletePayload } = validPayload;
    const res = await testRequest(app).post("/api/projects").send(incompletePayload);

    expect([400, 500]).toContain(res.status);
  });
});
