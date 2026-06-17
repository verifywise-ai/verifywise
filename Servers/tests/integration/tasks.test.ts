import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const ADMIN_EMAIL = "task-admin@test.com";
const ADMIN_PASSWORD = "TaskAdmin1!";

describe("Tasks API", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("POST /api/tasks", () => {
    it("creates a task with bypassAuth (201)", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/tasks")
        .send({ title: "Test Task", description: "A test task description" });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe("Test Task");
    });

    it("creates a task with real JWT from login (201)", async () => {
      const app = createTestApp();

      const loginRes = await testRequest(app)
        .post("/api/users/login")
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      expect(loginRes.status).toBe(202);
      const token = loginRes.body.data.token;

      const res = await testRequest(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "JWT Task", priority: "High" });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe("JWT Task");
    });

    it("returns 400 without auth (no token)", async () => {
      const app = createTestApp();
      const res = await testRequest(app).post("/api/tasks").send({ title: "Unauthorized Task" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/tasks", () => {
    it("returns paginated task list", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app).get("/api/tasks");

      expect(res.status).toBe(200);
      expect(res.body.data.tasks).toBeDefined();
      expect(res.body.data.pagination).toBeDefined();
    });

    it("includes created task in list", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      await testRequest(app).post("/api/tasks").send({ title: "Listable Task" });

      const res = await testRequest(app).get("/api/tasks");

      expect(res.status).toBe(200);
      const titles = res.body.data.tasks.map((t: any) => t.title);
      expect(titles).toContain("Listable Task");
    });
  });
});
