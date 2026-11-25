jest.setTimeout(60000);

// Must stay before the app's modules: setup.ts stubs inAppNotification.service.
import { createTestApp, testRequest } from "./setup";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { assignTaskToUser, createTestIncident, createTestTask } from "../factories";

/**
 * Tasks linked to incidents (task_entity_links, entity_type "incident"):
 * linking through the API and with a task save, the archived-incident rule
 * (409 on the link route and on a task save), the incident's linked-tasks
 * list (GET /api/v1/tasks/linked/:entityType/:entityId; the legacy GET
 * /tasks contract is unchanged), and the cleanup when an incident is
 * hard-deleted.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;
type Api = ReturnType<typeof testRequest>;

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

async function user(orgId: number, role: RoleName): Promise<number> {
  return createTestUser(orgId, ROLE[role], `incident-task-${unique()}@test.com`, "Pw123456!");
}

async function apiAs(orgId: number, userId: number, role: RoleName): Promise<Api> {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function incidentLinks(orgId: number, incidentId: number) {
  return sequelize.query<{ task_id: number }>(
    `SELECT task_id FROM task_entity_links
      WHERE organization_id = :orgId AND entity_type = 'incident' AND entity_id = :incidentId
      ORDER BY task_id`,
    { replacements: { orgId, incidentId }, type: QueryTypes.SELECT },
  );
}

async function visibleIncidentId(incidentId: number): Promise<string> {
  const [row] = await sequelize.query<{ incident_id: string }>(
    `SELECT incident_id FROM ai_incident_managements WHERE id = :incidentId`,
    { replacements: { incidentId }, type: QueryTypes.SELECT },
  );
  return row.incident_id;
}

describe("tasks linked to incidents", () => {
  let orgId: number;
  let adminId: number;
  let editorId: number;
  let admin: Api;
  let editor: Api;

  async function ownTask(userId: number, title = `Task ${unique()}`): Promise<number> {
    const taskId = await createTestTask(orgId, { creator_id: userId, title });
    await assignTaskToUser(orgId, taskId, userId);
    return taskId;
  }

  const link = (api: Api, taskId: number, entity_id: number) =>
    api.post(`/api/tasks/${taskId}/entities`).send({ entity_id, entity_type: "incident" });

  beforeEach(async () => {
    orgId = await createTestOrganization(`Incident tasks ${unique()}`);
    adminId = await user(orgId, "Admin");
    editorId = await user(orgId, "Editor");
    admin = await apiAs(orgId, adminId, "Admin");
    editor = await apiAs(orgId, editorId, "Editor");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("links a task to an incident and names the link by its visible id and use case", async () => {
    const incidentId = await createTestIncident(orgId, adminId, { ai_project: "Credit scoring" });
    const taskId = await ownTask(editorId);

    const res = await link(editor, taskId, incidentId);

    expect(res.status).toBe(201);
    expect(await incidentLinks(orgId, incidentId)).toEqual([{ task_id: taskId }]);
    const links = await editor.get(`/api/tasks/${taskId}/entities`);
    expect(links.status).toBe(200);
    expect(links.body.data).toEqual([
      expect.objectContaining({
        entity_type: "incident",
        entity_id: incidentId,
        entity_name: `${await visibleIncidentId(incidentId)} · Credit scoring`,
      }),
    ]);
  });

  it("names the link after the incident's current use case, not the text stored with it", async () => {
    const incidentId = await createTestIncident(orgId, adminId, { ai_project: "Old name" });
    const taskId = await ownTask(editorId);
    await editor
      .post(`/api/tasks/${taskId}/entities`)
      .send({ entity_id: incidentId, entity_type: "incident", entity_name: "Whatever was sent" });
    await sequelize.query(
      `UPDATE ai_incident_managements SET ai_project = 'New name' WHERE id = :incidentId`,
      { replacements: { incidentId } },
    );

    const links = await editor.get(`/api/tasks/${taskId}/entities`);

    expect(links.body.data[0].entity_name).toBe(
      `${await visibleIncidentId(incidentId)} · New name`,
    );
  });

  it("refuses to link an archived incident, with a restore message", async () => {
    const incidentId = await createTestIncident(orgId, adminId);
    expect((await admin.patch(`/api/ai-incident-managements/${incidentId}/archive`)).status).toBe(
      200,
    );

    const res = await link(editor, await ownTask(editorId), incidentId);

    expect(res.status).toBe(409);
    expect(res.body.data).toBe("Restore this incident before linking it to a task.");
    expect(await incidentLinks(orgId, incidentId)).toEqual([]);
  });

  it("refuses a new task linked to an archived incident and creates nothing", async () => {
    const incidentId = await createTestIncident(orgId, adminId);
    await admin.patch(`/api/ai-incident-managements/${incidentId}/archive`);
    const title = `Follow up ${unique()}`;

    const res = await editor.post("/api/tasks").send({
      title,
      assignees: [editorId],
      entity_links: [{ entity_id: incidentId, entity_type: "incident" }],
    });

    expect(res.status).toBe(409);
    expect(res.body.data).toBe("Restore this incident before linking it to a task.");
    expect(await incidentLinks(orgId, incidentId)).toEqual([]);
    const created = await sequelize.query(
      `SELECT id FROM tasks WHERE organization_id = :orgId AND title = :title`,
      { replacements: { orgId, title }, type: QueryTypes.SELECT },
    );
    expect(created).toEqual([]);
  });

  it("refuses a task update that adds an archived incident and keeps the task as it was", async () => {
    const incidentId = await createTestIncident(orgId, adminId);
    await admin.patch(`/api/ai-incident-managements/${incidentId}/archive`);
    const taskId = await ownTask(editorId, "Before");

    const res = await editor.put(`/api/tasks/${taskId}`).send({
      title: "After",
      entity_links: [{ entity_id: incidentId, entity_type: "incident" }],
    });

    expect(res.status).toBe(409);
    expect(await incidentLinks(orgId, incidentId)).toEqual([]);
    const [task] = await sequelize.query<{ title: string }>(
      `SELECT title FROM tasks WHERE id = :taskId`,
      { replacements: { taskId }, type: QueryTypes.SELECT },
    );
    expect(task.title).toBe("Before");
  });

  it("keeps a link made before the incident was archived through a task save", async () => {
    const incidentId = await createTestIncident(orgId, adminId);
    const taskId = await ownTask(editorId);
    expect((await link(editor, taskId, incidentId)).status).toBe(201);
    await admin.patch(`/api/ai-incident-managements/${incidentId}/archive`);

    const res = await editor.put(`/api/tasks/${taskId}`).send({
      title: "Renamed",
      entity_links: [{ entity_id: incidentId, entity_type: "incident" }],
    });

    expect(res.status).toBe(200);
    expect(await incidentLinks(orgId, incidentId)).toEqual([{ task_id: taskId }]);
  });

  it("answers 404 for another organization's incident", async () => {
    const otherOrg = await createTestOrganization(`Other ${unique()}`);
    const otherAdmin = await user(otherOrg, "Admin");
    const foreignIncident = await createTestIncident(otherOrg, otherAdmin);

    const res = await link(editor, await ownTask(editorId), foreignIncident);

    expect(res.status).toBe(404);
    expect(await incidentLinks(orgId, foreignIncident)).toEqual([]);
  });

  describe("GET /api/v1/tasks/linked/:entityType/:entityId", () => {
    const linkedTo = (api: Api, incidentId: number | string) =>
      api.get(`/api/v1/tasks/linked/incident/${incidentId}`);

    it("lists only the tasks linked to the incident", async () => {
      const incidentId = await createTestIncident(orgId, adminId);
      const otherIncident = await createTestIncident(orgId, adminId);
      const linked = await ownTask(editorId, "Contain the harm");
      const elsewhere = await ownTask(editorId, "Other incident's task");
      await ownTask(editorId, "Unlinked task");
      await link(editor, linked, incidentId);
      await link(editor, elsewhere, otherIncident);

      const res = await linkedTo(editor, incidentId);

      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { id: number }) => t.id)).toEqual([linked]);
    });

    it("leaves archived tasks out", async () => {
      const incidentId = await createTestIncident(orgId, adminId);
      const taskId = await ownTask(editorId);
      await link(editor, taskId, incidentId);
      await editor.delete(`/api/tasks/${taskId}`);

      const res = await linkedTo(editor, incidentId);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it("never lists another organization's tasks", async () => {
      const incidentId = await createTestIncident(orgId, adminId);
      const taskId = await ownTask(editorId);
      await link(editor, taskId, incidentId);
      const otherOrg = await createTestOrganization(`Other ${unique()}`);
      const otherAdmin = await user(otherOrg, "Admin");

      const res = await linkedTo(await apiAs(otherOrg, otherAdmin, "Admin"), incidentId);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it("applies task visibility: a member who neither created nor holds the task sees nothing", async () => {
      const incidentId = await createTestIncident(orgId, adminId);
      const taskId = await ownTask(editorId);
      await link(editor, taskId, incidentId);
      const outsiderId = await user(orgId, "Editor");

      const outsider = await linkedTo(await apiAs(orgId, outsiderId, "Editor"), incidentId);
      const adminView = await linkedTo(admin, incidentId);

      expect(outsider.status).toBe(200);
      expect(outsider.body.data).toEqual([]);
      expect(adminView.body.data.map((t: { id: number }) => t.id)).toEqual([taskId]);
    });

    it.each([
      ["an unknown type", "/api/v1/tasks/linked/spaceship/3"],
      ["a non-numeric id", "/api/v1/tasks/linked/incident/3abc"],
      ["a zero id", "/api/v1/tasks/linked/incident/0"],
    ])("answers 400 for %s", async (_label, url) => {
      const res = await editor.get(url);
      expect(res.status).toBe(400);
    });

    it("leaves the legacy GET /tasks contract as it was: linked_entity_* is ignored", async () => {
      const incidentId = await createTestIncident(orgId, adminId);
      const linked = await ownTask(editorId);
      const unlinked = await ownTask(editorId);
      await link(editor, linked, incidentId);

      const res = await editor.get(
        `/api/tasks?linked_entity_type=incident&linked_entity_id=${incidentId}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.tasks.map((t: { id: number }) => t.id).sort()).toEqual(
        [linked, unlinked].sort(),
      );
    });
  });

  it("deleting an incident deletes its task links and keeps the tasks", async () => {
    const incidentId = await createTestIncident(orgId, adminId);
    const otherIncident = await createTestIncident(orgId, adminId);
    const taskId = await ownTask(editorId);
    await link(editor, taskId, incidentId);
    await link(editor, taskId, otherIncident);

    const res = await admin.delete(`/api/ai-incident-managements/${incidentId}`);

    expect(res.status).toBe(200);
    expect(await incidentLinks(orgId, incidentId)).toEqual([]);
    expect(await incidentLinks(orgId, otherIncident)).toEqual([{ task_id: taskId }]);
    expect((await editor.get(`/api/tasks/${taskId}`)).status).toBe(200);
  });
});
