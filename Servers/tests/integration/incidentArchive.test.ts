jest.setTimeout(60000);

const mockEnqueue = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("../../services/automations/automationProducer", () => ({
  ...jest.requireActual("../../services/automations/automationProducer"),
  enqueueAutomationAction: (...args: unknown[]) => mockEnqueue(...args),
}));

// Must stay before the app's modules: setup.ts stubs inAppNotification.service.
import { createTestApp, testRequest } from "./setup";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestIncident, createTestProject } from "../factories";
import { deleteIncidentByIdQuery } from "../../utils/incidentManagement.utils";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";
import "../../advisor/functions/incidentFunctions";

/**
 * Incidents PR C: archive and restore through the shared update path, delete
 * with history and post-commit automation, the Advisor's create on the
 * console's create path, CE marking incident links, and Wise Search.
 */

const ROUTE = "/api/ai-incident-managements";

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

async function apiAs(orgId: number, userId: number, role = "Admin") {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function activateAutomation(orgId: number, triggerKey: string) {
  const [trigger] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_triggers WHERE key = :triggerKey`,
    { replacements: { triggerKey }, type: QueryTypes.SELECT },
  );
  const [action] = await sequelize.query<{ id: number }>(
    `SELECT id FROM automation_actions ORDER BY id LIMIT 1`,
    { type: QueryTypes.SELECT },
  );
  const [automation] = await sequelize.query<{ id: number }>(
    `INSERT INTO automations (organization_id, name, trigger_id, is_active)
     VALUES (:orgId, :triggerKey, :triggerId, true) RETURNING id`,
    { replacements: { orgId, triggerKey, triggerId: trigger.id }, type: QueryTypes.SELECT },
  );
  await sequelize.query(
    `INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
     VALUES (:orgId, :automationId, :actionId, :params, 1)`,
    {
      replacements: {
        orgId,
        automationId: automation.id,
        actionId: action.id,
        params: JSON.stringify({
          subject: "Incident {{incident.ai_project}}",
          body: "Changed",
        }),
      },
    },
  );
}

async function historyOf(incidentId: number) {
  return sequelize.query<{
    action: string;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    changed_by_user_id: number | null;
    changed_by_system: boolean | null;
  }>(
    `SELECT action, field_name, old_value, new_value, changed_by_user_id, changed_by_system
       FROM incident_change_history WHERE incident_id = :incidentId ORDER BY id`,
    { replacements: { incidentId }, type: QueryTypes.SELECT },
  );
}

async function incidentRow(id: number) {
  const [row] = await sequelize.query<Record<string, any>>(
    `SELECT * FROM ai_incident_managements WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row;
}

describe("incident archive, restore, delete, links and search", () => {
  let orgId: number;
  let adminId: number;
  let api: Awaited<ReturnType<typeof apiAs>>;

  beforeEach(async () => {
    mockEnqueue.mockClear();
    orgId = await createTestOrganization(`Incident archive ${unique()}`);
    adminId = await createTestUser(orgId, 1, `admin-${unique()}@test.com`, "Password123!");
    api = await apiAs(orgId, adminId);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("archive and restore", () => {
    it("archives and restores through the update path, recording both in history", async () => {
      await activateAutomation(orgId, "incident_updated");
      const id = await createTestIncident(orgId, adminId);
      const before = await incidentRow(id);

      const archived = await api.patch(`${ROUTE}/${id}/archive`).send({});
      expect(archived.status).toBe(200);
      expect(archived.body.data.archived).toBe(true);
      const afterArchive = await incidentRow(id);
      expect(afterArchive.archived).toBe(true);
      // updated_at is bumped. (Compared for change only: the factory writes it
      // with the database's NOW() and the app with a JS Date, which differ by
      // the server's offset on this TIMESTAMP WITHOUT TIME ZONE column.)
      expect(new Date(afterArchive.updated_at).getTime()).not.toBe(
        new Date(before.updated_at).getTime(),
      );

      // Restore is the ordinary update; the archive route stays archive-only.
      const restored = await api.patch(`${ROUTE}/${id}`).send({ archived: false });
      expect(restored.status).toBe(200);
      expect(restored.body.data.archived).toBe(false);
      expect((await incidentRow(id)).archived).toBe(false);

      const history = await historyOf(id);
      expect(history.map((h) => [h.action, h.field_name, h.old_value, h.new_value])).toEqual([
        ["updated", "Archived", "No", "Yes"],
        ["updated", "Archived", "Yes", "No"],
      ]);
      expect(history.every((h) => h.changed_by_user_id === adminId)).toBe(true);
      // incident_updated after each commit.
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockEnqueue).toHaveBeenCalledTimes(2);
    });

    it("archiving an archived incident changes and records nothing", async () => {
      const id = await createTestIncident(orgId, adminId);
      await api.patch(`${ROUTE}/${id}/archive`).send({});

      const again = await api.patch(`${ROUTE}/${id}/archive`).send({});

      expect(again.status).toBe(200);
      expect(await historyOf(id)).toHaveLength(1);
    });

    it("waits for the row lock and decides on the row it then reads", async () => {
      const id = await createTestIncident(orgId, adminId);
      // Another writer holds the row and archives it.
      const other: Transaction = await sequelize.transaction();
      await sequelize.query(`SELECT id FROM ai_incident_managements WHERE id = :id FOR UPDATE`, {
        replacements: { id },
        transaction: other,
      });
      await sequelize.query(
        `UPDATE ai_incident_managements SET archived = true, updated_at = NOW() WHERE id = :id`,
        { replacements: { id }, transaction: other },
      );

      let settled = false;
      const request = api
        .patch(`${ROUTE}/${id}/archive`)
        .send({})
        .then((res) => {
          settled = true;
          return res;
        });
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(settled).toBe(false);

      await other.commit();
      const res = await request;

      expect(res.status).toBe(200);
      // Read after the lock: already archived, so nothing was written or recorded.
      expect(await historyOf(id)).toHaveLength(0);
    });

    it("answers 404 for a missing or foreign incident", async () => {
      const otherOrg = await createTestOrganization(`Other ${unique()}`);
      const otherAdmin = await createTestUser(otherOrg, 1, `o-${unique()}@test.com`, "Pw1!x");
      const foreign = await createTestIncident(otherOrg, otherAdmin);

      const missing = await api.patch(`${ROUTE}/999999999/archive`).send({});
      const foreignRes = await api.patch(`${ROUTE}/${foreign}/archive`).send({});

      expect([missing.status, foreignRes.status]).toEqual([404, 404]);
      expect((await incidentRow(foreign)).archived).toBe(false);
    });

    it("the archive route ignores a body asking to restore", async () => {
      const id = await createTestIncident(orgId, adminId);

      const res = await api.patch(`${ROUTE}/${id}/archive`).send({ archived: false });

      expect(res.status).toBe(200);
      expect((await incidentRow(id)).archived).toBe(true);
    });

    it("archives and restores an incident whose owner has left the organization", async () => {
      const ownerId = await createTestUser(orgId, 3, `owner-${unique()}@test.com`, "Pw1!x");
      const id = await createTestIncident(orgId, adminId, { assignee_id: ownerId });
      // The owner moves to another organization; this membership is removed
      // directly, so the incident keeps the departed owner (a user must keep
      // at least one membership).
      const elsewhere = await createTestOrganization(`Elsewhere ${unique()}`);
      await sequelize.query(
        `INSERT INTO organization_members (organization_id, user_id, role_id)
         VALUES (:elsewhere, :ownerId, 3)`,
        { replacements: { elsewhere, ownerId } },
      );
      await sequelize.query(
        `DELETE FROM organization_members WHERE organization_id = :orgId AND user_id = :ownerId`,
        { replacements: { orgId, ownerId } },
      );

      const archived = await api.patch(`${ROUTE}/${id}/archive`).send({});
      const restored = await api.patch(`${ROUTE}/${id}`).send({ archived: false });
      const edited = await api.patch(`${ROUTE}/${id}`).send({ status: "Investigating" });

      expect([archived.status, restored.status, edited.status]).toEqual([200, 200, 200]);
      const row = await incidentRow(id);
      expect(row.assignee_id).toBe(ownerId);
      expect(row.status).toBe("Investigating");
    });

    it("refuses edits to an archived incident until it is restored", async () => {
      const id = await createTestIncident(orgId, adminId);
      await api.patch(`${ROUTE}/${id}/archive`).send({});

      const edit = await api.patch(`${ROUTE}/${id}`).send({ status: "Closed" });
      const restoreAndEdit = await api
        .patch(`${ROUTE}/${id}`)
        .send({ archived: false, status: "Closed" });

      expect([edit.status, restoreAndEdit.status]).toEqual([409, 409]);
      expect(edit.body.data).toEqual(
        expect.objectContaining({
          message: "Restore this incident before editing it.",
          code: "INCIDENT_ARCHIVED",
        }),
      );
      const row = await incidentRow(id);
      expect([row.status, row.archived]).toEqual(["Open", true]);

      const restore = await api.patch(`${ROUTE}/${id}`).send({ archived: false });
      const editAfter = await api.patch(`${ROUTE}/${id}`).send({ status: "Closed" });
      expect([restore.status, editAfter.status]).toEqual([200, 200]);
      expect((await incidentRow(id)).status).toBe("Closed");
    });
  });

  describe("delete", () => {
    it("records a deletion entry that outlives the incident and sends incident_deleted after commit", async () => {
      await activateAutomation(orgId, "incident_deleted");
      const id = await createTestIncident(orgId, adminId, { ai_project: "Fraud model" });

      const res = await api.delete(`${ROUTE}/${id}`);

      expect(res.status).toBe(200);
      expect(await incidentRow(id)).toBeUndefined();
      expect(await historyOf(id)).toEqual([
        expect.objectContaining({
          action: "deleted",
          field_name: "Incident",
          old_value: "Active",
          new_value: "Deleted",
          changed_by_user_id: adminId,
        }),
      ]);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockEnqueue.mock.calls[0][1]).toEqual(
        expect.objectContaining({ subject: "Incident Fraud model", organizationId: orgId }),
      );
    });

    it("sends nothing for a delete that rolls back", async () => {
      await activateAutomation(orgId, "incident_deleted");
      const id = await createTestIncident(orgId, adminId);

      await expect(
        sequelize.transaction(async (t) => {
          expect(await deleteIncidentByIdQuery(id, orgId, t)).not.toBeNull();
          throw new Error("later step failed");
        }),
      ).rejects.toThrow("later step failed");

      await new Promise((resolve) => setImmediate(resolve));
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(await incidentRow(id)).toBeDefined();
    });

    it("answers 404 for a missing or foreign incident and sends nothing", async () => {
      await activateAutomation(orgId, "incident_deleted");
      const otherOrg = await createTestOrganization(`Other ${unique()}`);
      const otherAdmin = await createTestUser(otherOrg, 1, `o-${unique()}@test.com`, "Pw1!x");
      const foreign = await createTestIncident(otherOrg, otherAdmin);

      const missing = await api.delete(`${ROUTE}/999999999`);
      const foreignRes = await api.delete(`${ROUTE}/${foreign}`);

      expect([missing.status, foreignRes.status]).toEqual([404, 404]);
      expect(await incidentRow(foreign)).toBeDefined();
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it("the Advisor refuses a missing incident and sends nothing", async () => {
      await activateAutomation(orgId, "incident_deleted");

      const result = await writeToolExecutors.get("agent_delete_incident")!(
        { incident_id: 999999999, _userId: adminId, _requesterId: adminId },
        orgId,
      );

      expect(result).toEqual({ success: false, message: "Incident #999999999 not found." });
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("Advisor create", () => {
    it("keeps project_id and records creation history", async () => {
      const projectId = await createTestProject(orgId, adminId);

      const result = (await writeToolExecutors.get("agent_create_incident")!(
        {
          title: "Chatbot",
          description: "Gave unsafe advice to a customer",
          project_id: projectId,
          _userId: adminId,
          _requesterId: adminId,
        },
        orgId,
      )) as { id: number; project_id: number };

      expect(result.project_id).toBe(projectId);
      expect((await incidentRow(result.id)).project_id).toBe(projectId);
      const history = await historyOf(result.id);
      expect(history.length).toBeGreaterThan(0);
      expect(history.every((h) => h.action === "created")).toBe(true);
      expect(history.every((h) => h.changed_by_user_id === adminId)).toBe(true);
      expect(history.map((h) => h.field_name)).toEqual(
        expect.arrayContaining(["Linked use case", "Description"]),
      );
    });

    it("refuses another organization's use case", async () => {
      const otherOrg = await createTestOrganization(`Other ${unique()}`);
      const otherAdmin = await createTestUser(otherOrg, 1, `o-${unique()}@test.com`, "Pw1!x");
      const foreignProject = await createTestProject(otherOrg, otherAdmin);

      await expect(
        writeToolExecutors.get("agent_create_incident")!(
          {
            title: "Chatbot",
            description: "Gave unsafe advice to a customer",
            project_id: foreignProject,
            _userId: adminId,
            _requesterId: adminId,
          },
          orgId,
        ),
      ).rejects.toThrow("project_id does not reference an entity in your organization");
      const [{ count }] = await sequelize.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ai_incident_managements WHERE organization_id = :orgId`,
        { replacements: { orgId }, type: QueryTypes.SELECT },
      );
      expect(count).toBe(0);
    });
  });

  describe("CE marking incident links", () => {
    let projectId: number;
    const ce = () => `/api/ce-marking/${projectId}`;

    beforeEach(async () => {
      projectId = await createTestProject(orgId, adminId);
      // GET creates the CE marking record.
      expect((await api.get(ce())).status).toBe(200);
    });

    it("links the organization's incidents and drops a deleted one", async () => {
      const a = await createTestIncident(orgId, adminId, { project_id: projectId });
      const b = await createTestIncident(orgId, adminId, { project_id: projectId });

      const res = await api.put(ce()).send({ linkedIncidents: [a, String(b), a] });

      expect(res.status).toBe(200);
      expect(res.body.linkedIncidents).toEqual([a, b].sort((x, y) => x - y));
      expect(res.body.totalIncidents).toBe(2);

      await api.delete(`${ROUTE}/${b}`);
      const after = await api.get(ce());
      expect(after.body.linkedIncidents).toEqual([a]);
    });

    it("answers 400 for another organization's incident and stores nothing", async () => {
      const own = await createTestIncident(orgId, adminId);
      const otherOrg = await createTestOrganization(`Other ${unique()}`);
      const otherAdmin = await createTestUser(otherOrg, 1, `o-${unique()}@test.com`, "Pw1!x");
      const foreign = await createTestIncident(otherOrg, otherAdmin);

      const res = await api.put(ce()).send({ linkedIncidents: [own, foreign] });

      expect(res.status).toBe(400);
      const after = await api.get(ce());
      expect(after.body.linkedIncidents).toEqual([]);
    });

    it("answers 400 for a non-numeric id", async () => {
      const own = await createTestIncident(orgId, adminId);

      const res = await api.put(ce()).send({ linkedIncidents: [own, "abc"] });

      expect(res.status).toBe(400);
    });

    it("never returns a link to another organization's incident stored before validation", async () => {
      const own = await createTestIncident(orgId, adminId);
      const otherOrg = await createTestOrganization(`Other ${unique()}`);
      const otherAdmin = await createTestUser(otherOrg, 1, `o-${unique()}@test.com`, "Pw1!x");
      const foreign = await createTestIncident(otherOrg, otherAdmin);
      const [{ id: ceMarkingId }] = await sequelize.query<{ id: number }>(
        `SELECT id FROM ce_markings WHERE project_id = :projectId`,
        { replacements: { projectId }, type: QueryTypes.SELECT },
      );
      for (const incidentId of [own, foreign]) {
        await sequelize.query(
          `INSERT INTO ce_marking_incidents (ce_marking_id, organization_id, incident_id, linked_by, linked_at)
           VALUES (:ceMarkingId, :orgId, :incidentId, :adminId, NOW())`,
          { replacements: { ceMarkingId, orgId, incidentId, adminId } },
        );
      }

      const res = await api.get(ce());

      expect(res.body.linkedIncidents).toEqual([own]);
    });
  });

  describe("Wise Search", () => {
    it("finds an incident by its visible id and leaves archived incidents out", async () => {
      const active = await createTestIncident(orgId, adminId, { ai_project: "Searchable bot" });
      const archived = await createTestIncident(orgId, adminId, { ai_project: "Searchable bot" });
      await api.patch(`${ROUTE}/${archived}/archive`).send({});
      const { incident_id: visibleId } = await incidentRow(active);

      const byName = await api.get(`/api/search?q=${encodeURIComponent("Searchable bot")}`);
      const byVisibleId = await api.get(`/api/search?q=${encodeURIComponent(visibleId)}`);

      const ids = (res: { body: any }) =>
        (res.body.data.results.incident_management?.results ?? []).map((r: any) => r.id);
      expect(ids(byName)).toEqual([active]);
      expect(ids(byVisibleId)).toEqual([active]);
    });
  });
});
