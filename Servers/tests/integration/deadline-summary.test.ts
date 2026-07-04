import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { createTestTask, assignTaskToUser } from "../factories/test-entities.factory";

const ADMIN_EMAIL = "deadline-admin@test.com";
const ADMIN_PASSWORD = "DeadlineAdmin1!";
const EDITOR_EMAIL = "deadline-editor@test.com";
const EDITOR_PASSWORD = "DeadlineEditor1!";

describe("GET /api/deadlines/summary", () => {
  let orgId: number;
  let adminId: number;
  let editorId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    adminId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
    editorId = await createTestUser(orgId, 3, EDITOR_EMAIL, EDITOR_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  const dateOffsetDays = (days: number): Date => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return date;
  };

  it("returns overdue and due-soon counts for an admin", async () => {
    const app = createTestApp({
      bypassAuth: true,
      mockUser: { userId: adminId, organizationId: orgId, role: "Admin" },
    });

    await createTestTask(orgId, {
      title: "Overdue task",
      creator_id: adminId,
      due_date: dateOffsetDays(-1),
      status: "Open",
    });

    await createTestTask(orgId, {
      title: "Due soon task",
      creator_id: adminId,
      due_date: dateOffsetDays(3),
      status: "Open",
    });

    await createTestTask(orgId, {
      title: "Completed task",
      creator_id: adminId,
      due_date: dateOffsetDays(-1),
      status: "Completed",
    });

    await createTestTask(orgId, {
      title: "Deleted task",
      creator_id: adminId,
      due_date: dateOffsetDays(3),
      status: "Deleted",
    });

    const res = await testRequest(app).get("/api/deadlines/summary?threshold=7");

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toEqual({
      overdue: 1,
      dueSoon: 1,
      threshold: 7,
    });
  });

  it("respects per-user visibility for non-admins", async () => {
    const app = createTestApp({
      bypassAuth: true,
      mockUser: {
        userId: editorId,
        organizationId: orgId,
        role: "Editor",
      },
    });

    const adminTaskId = await createTestTask(orgId, {
      title: "Admin task due soon",
      creator_id: adminId,
      due_date: dateOffsetDays(2),
      status: "Open",
    });

    await createTestTask(orgId, {
      title: "Editor task overdue",
      creator_id: editorId,
      due_date: dateOffsetDays(-1),
      status: "Open",
    });

    await assignTaskToUser(orgId, adminTaskId, editorId);

    const res = await testRequest(app).get("/api/deadlines/summary?threshold=7");

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toEqual({
      overdue: 1,
      dueSoon: 1,
      threshold: 7,
    });
  });

  it("falls back to the default threshold when none is provided", async () => {
    const app = createTestApp({
      bypassAuth: true,
      mockUser: { userId: adminId, organizationId: orgId, role: "Admin" },
    });

    await createTestTask(orgId, {
      title: "Task due in 10 days",
      creator_id: adminId,
      due_date: dateOffsetDays(10),
      status: "Open",
    });

    const res = await testRequest(app).get("/api/deadlines/summary");

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.dueSoon).toBe(1);
    expect(res.body.data.tasks.threshold).toBe(14);
  });
});
