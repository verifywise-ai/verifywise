import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const ADMIN_EMAIL = "approval-admin@test.com";
const ADMIN_PASSWORD = "ApprovalAdmin1!";

describe("Approval Workflows API", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("POST /api/approval-workflows", () => {
    const validWorkflowPayload = {
      workflow_title: "Test Approval Workflow",
      entity_type: "vendor",
      description: "A test workflow for integration tests",
      steps: [
        {
          step_name: "Review",
          approver_ids: [1],
          requires_all_approvers: true,
        },
      ],
    };

    it("creates an approval workflow with bypassAuth (201)", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app).post("/api/approval-workflows").send(validWorkflowPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.workflow_title).toBe("Test Approval Workflow");
      expect(res.body.data.entity_type).toBe("vendor");
    });

    it("returns 400 for missing workflow title", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const { workflow_title, ...incompletePayload } = validWorkflowPayload;
      const res = await testRequest(app).post("/api/approval-workflows").send(incompletePayload);

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid entity_type", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .send({ ...validWorkflowPayload, entity_type: "invalid_type" });

      expect(res.status).toBe(400);
    });

    it("returns 403 for non-admin user", async () => {
      const app = createTestApp();
      const nonAdminOrgId = await createTestOrganization();
      await createTestUser(nonAdminOrgId, 3, "editor@test.com", "EditorPass1!");

      const loginRes = await testRequest(app)
        .post("/api/users/login")
        .send({ email: "editor@test.com", password: "EditorPass1!" });
      expect(loginRes.status).toBe(202);
      const token = loginRes.body.data.token;

      const res = await testRequest(app)
        .post("/api/approval-workflows")
        .set("Authorization", `Bearer ${token}`)
        .send(validWorkflowPayload);

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/approval-requests", () => {
    it("creates an approval request referencing a workflow (201)", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      // First create a workflow
      const workflowRes = await testRequest(app)
        .post("/api/approval-workflows")
        .send({
          workflow_title: "Request Test Workflow",
          entity_type: "vendor",
          steps: [
            {
              step_name: "Approve",
              approver_ids: [userId],
              requires_all_approvers: false,
            },
          ],
        });
      expect(workflowRes.status).toBe(201);
      const workflowId = workflowRes.body.data.id;

      // Create an approval request referencing that workflow
      const requestRes = await testRequest(app)
        .post("/api/approval-requests")
        .send({ request_name: "Test Approval Request", workflow_id: workflowId });

      expect(requestRes.status).toBe(201);
      expect(requestRes.body.data.request_name).toBe("Test Approval Request");
    });

    it("returns 400 for missing request name", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app).post("/api/approval-requests").send({ workflow_id: 999 });

      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent workflow", async () => {
      const app = createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/approval-requests")
        .send({ request_name: "Ghost Request", workflow_id: 99999 });

      expect(res.status).toBe(404);
    });
  });
});
