jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories/test-entities.factory";
import { removeUserFromOrganizationQuery } from "../../utils/user.utils";

/**
 * RACI per use case (#5255): v1 endpoints over a real database. Derivation and
 * merge rules are unit-tested in utils/__tests__/raci.utils.test.ts.
 */

let counter = 0;
const nextEmail = () => {
  counter += 1;
  return `raci-${Date.now()}-${counter}@test.com`;
};

/** role ids: 1 Admin, 2 Reviewer, 3 Editor, 4 Auditor */
const ROLE_NAMES: Record<number, string> = { 1: "Admin", 2: "Reviewer", 3: "Editor", 4: "Auditor" };

async function user(orgId: number, roleId = 1): Promise<number> {
  return createTestUser(orgId, roleId, nextEmail(), "Password123!");
}

async function apiAs(orgId: number, userId: number, roleId = 1) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: ROLE_NAMES[roleId] },
  });
  return testRequest(app);
}

async function addMember(orgId: number, projectId: number, userId: number) {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId } },
  );
}

const rowFor = (body: any, userId: number) =>
  body.data.rows.find((row: any) => row.subject_id === userId);
const rolesFor = (body: any, userId: number) =>
  rowFor(body, userId)?.roles.map((r: any) => r.role) ?? [];

async function overrides(projectId: number, userId: number) {
  const [rows] = await sequelize.query(
    `SELECT raci_role, state FROM raci_entries
      WHERE project_id = :projectId AND user_id = :userId ORDER BY raci_role`,
    { replacements: { projectId, userId } },
  );
  return rows as Array<{ raci_role: string; state: string }>;
}

describe("RACI per use case", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("authentication", () => {
    it("refuses both endpoints without a token", async () => {
      const app = await createTestApp();
      const read = await testRequest(app).get("/api/v1/projects/1/raci");
      expect([400, 401]).toContain(read.status);
      const write = await testRequest(app)
        .put("/api/v1/projects/1/raci/users/1")
        .send({ add: ["R"] });
      expect([400, 401]).toContain(write.status);
    });
  });

  describe("GET /:id/raci", () => {
    it("derives the matrix and sends the documented shape", async () => {
      const orgId = await createTestOrganization("RACI read");
      const ownerId = await user(orgId);
      const memberId = await user(orgId, 3);
      const projectId = await createTestProject(orgId, ownerId);
      await addMember(orgId, projectId, memberId);
      const api = await apiAs(orgId, ownerId);

      const res = await api.get(`/api/v1/projects/${projectId}/raci`);

      expect(res.status).toBe(200);
      expect(res.body.data.warnings).toEqual([]);
      expect(res.body.data.rows[0]).toMatchObject({
        subject_type: "user",
        subject_id: ownerId,
        roles: [{ role: "A", sources: ["owner"] }],
        editable: true,
      });
      expect(rolesFor(res.body, memberId)).toEqual(["R"]);
    });

    async function attachWorkflow(
      orgId: number,
      ownerId: number,
      approverId: number,
      projectId: number,
    ) {
      const [workflow] = await sequelize.query(
        `INSERT INTO approval_workflows (organization_id, workflow_title, entity_type, created_by)
         VALUES (:orgId, 'Review', 'use_case', :ownerId) RETURNING id`,
        { replacements: { orgId, ownerId } },
      );
      const workflowId = (workflow as any[])[0].id;
      const [step] = await sequelize.query(
        `INSERT INTO approval_workflow_steps (organization_id, workflow_id, step_number, step_name)
         VALUES (:orgId, :workflowId, 1, 'First') RETURNING id`,
        { replacements: { orgId, workflowId } },
      );
      await sequelize.query(
        `INSERT INTO approval_step_approvers (organization_id, workflow_step_id, approver_id)
         VALUES (:orgId, :stepId, :approverId)`,
        { replacements: { orgId, stepId: (step as any[])[0].id, approverId } },
      );
      await sequelize.query(
        `UPDATE projects SET approval_workflow_id = :workflowId WHERE id = :projectId`,
        { replacements: { workflowId, projectId } },
      );
      return workflowId as number;
    }

    it("includes approvers from the use case's workflow as consulted", async () => {
      const orgId = await createTestOrganization("RACI approvers");
      const ownerId = await user(orgId);
      const approverId = await user(orgId, 2);
      const projectId = await createTestProject(orgId, ownerId);
      await attachWorkflow(orgId, ownerId, approverId, projectId);
      const api = await apiAs(orgId, ownerId);

      const res = await api.get(`/api/v1/projects/${projectId}/raci`);

      expect(rowFor(res.body, approverId).roles).toEqual([{ role: "C", sources: ["approver"] }]);
      expect(res.body.data.warnings).toEqual([]);
    });

    it("leaves out approvers of a deleted workflow", async () => {
      const orgId = await createTestOrganization("RACI inactive workflow");
      const ownerId = await user(orgId);
      const approverId = await user(orgId, 2);
      const projectId = await createTestProject(orgId, ownerId);
      const workflowId = await attachWorkflow(orgId, ownerId, approverId, projectId);
      await sequelize.query(
        `UPDATE approval_workflows SET is_active = false WHERE id = :workflowId`,
        {
          replacements: { workflowId },
        },
      );
      const api = await apiAs(orgId, ownerId);

      const res = await api.get(`/api/v1/projects/${projectId}/raci`);

      expect(res.status).toBe(200);
      expect(rowFor(res.body, approverId)).toBeUndefined();
    });

    it("counts assignees of open tasks linked to the use case's requirements only", async () => {
      const orgId = await createTestOrganization("RACI tasks");
      const ownerId = await user(orgId);
      const openAssignee = await user(orgId, 3);
      const doneAssignee = await user(orgId, 3);
      const otherAssignee = await user(orgId, 3);
      const subcontrolAssignee = await user(orgId, 3);
      const projectId = await createTestProject(orgId, ownerId);
      const otherProjectId = await createTestProject(orgId, ownerId);

      const addControl = async (forProject: number) => {
        const [frameworks] = await sequelize.query(
          `INSERT INTO projects_frameworks (organization_id, project_id, framework_id)
           VALUES (:orgId, :forProject, 1) RETURNING id`,
          { replacements: { orgId, forProject } },
        );
        const [controls] = await sequelize.query(
          `INSERT INTO controls_eu (organization_id, projects_frameworks_id)
           VALUES (:orgId, :pfId) RETURNING id`,
          { replacements: { orgId, pfId: (frameworks as any[])[0].id } },
        );
        return (controls as any[])[0].id as number;
      };
      const addLinkedTask = async (
        controlId: number,
        status: string,
        assignee: number,
        entityType = "eu_control",
      ) => {
        const [tasks] = await sequelize.query(
          `INSERT INTO tasks (organization_id, title, creator_id, status)
           VALUES (:orgId, 'Task', :ownerId, :status) RETURNING id`,
          { replacements: { orgId, ownerId, status } },
        );
        const taskId = (tasks as any[])[0].id;
        await sequelize.query(
          `INSERT INTO task_assignees (organization_id, task_id, user_id)
           VALUES (:orgId, :taskId, :assignee)`,
          { replacements: { orgId, taskId, assignee } },
        );
        await sequelize.query(
          `INSERT INTO task_entity_links (organization_id, task_id, entity_type, entity_id)
           VALUES (:orgId, :taskId, :entityType, :controlId)`,
          { replacements: { orgId, taskId, controlId, entityType } },
        );
      };

      const controlId = await addControl(projectId);
      await addLinkedTask(controlId, "Open", openAssignee);
      const [subcontrols] = await sequelize.query(
        `INSERT INTO subcontrols_eu (organization_id, control_id)
         VALUES (:orgId, :controlId) RETURNING id`,
        { replacements: { orgId, controlId } },
      );
      await addLinkedTask(
        (subcontrols as any[])[0].id,
        "Open",
        subcontrolAssignee,
        "eu_subcontrol",
      );
      await addLinkedTask(controlId, "Completed", doneAssignee);
      await addLinkedTask(await addControl(otherProjectId), "Open", otherAssignee);
      const api = await apiAs(orgId, ownerId);

      const res = await api.get(`/api/v1/projects/${projectId}/raci`);

      expect(rowFor(res.body, openAssignee).roles).toEqual([
        { role: "R", sources: ["task_assignee"] },
      ]);
      expect(rowFor(res.body, subcontrolAssignee).roles).toEqual([
        { role: "R", sources: ["task_assignee"] },
      ]);
      expect(rowFor(res.body, doneAssignee)).toBeUndefined();
      expect(rowFor(res.body, otherAssignee)).toBeUndefined();
    });

    it("sends an external owner read-only with no email", async () => {
      const orgId = await createTestOrganization("RACI external");
      const adminId = await user(orgId);
      const projectId = await createTestProject(orgId, adminId);
      await sequelize.query(
        `UPDATE projects SET owner = NULL, external_owner_name = 'Ada Lovelace',
           external_owner_email = 'ada@example.com' WHERE id = :projectId`,
        { replacements: { projectId } },
      );
      const api = await apiAs(orgId, adminId);

      const res = await api.get(`/api/v1/projects/${projectId}/raci`);

      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([
        {
          subject_type: "external",
          subject_id: null,
          name: "Ada Lovelace",
          email: null,
          roles: [{ role: "A", sources: ["owner"] }],
          editable: false,
        },
      ]);
      expect(JSON.stringify(res.body)).not.toContain("ada@example.com");
    });

    it("answers 404 to another organization", async () => {
      const orgA = await createTestOrganization("RACI org A");
      const orgB = await createTestOrganization("RACI org B");
      const ownerId = await user(orgA);
      const outsiderId = await user(orgB);
      const projectId = await createTestProject(orgA, ownerId);
      const api = await apiAs(orgB, outsiderId);

      const res = await api.get(`/api/v1/projects/${projectId}/raci`);

      expect(res.status).toBe(404);
      expect(res.body.data?.rows).toBeUndefined();
    });

    it("answers 404 to a non-admin who is neither owner nor member", async () => {
      const orgId = await createTestOrganization("RACI hidden");
      const ownerId = await user(orgId);
      const editorId = await user(orgId, 3);
      const projectId = await createTestProject(orgId, ownerId);
      const api = await apiAs(orgId, editorId, 3);

      expect((await api.get(`/api/v1/projects/${projectId}/raci`)).status).toBe(404);
    });

    it("lets a member who cannot edit read the matrix", async () => {
      const orgId = await createTestOrganization("RACI auditor read");
      const ownerId = await user(orgId);
      const auditorId = await user(orgId, 4);
      const projectId = await createTestProject(orgId, ownerId);
      await addMember(orgId, projectId, auditorId);
      const api = await apiAs(orgId, auditorId, 4);

      expect((await api.get(`/api/v1/projects/${projectId}/raci`)).status).toBe(200);
    });

    it("refuses an organizational use case", async () => {
      const orgId = await createTestOrganization("RACI organizational");
      const ownerId = await user(orgId);
      const projectId = await createTestProject(orgId, ownerId);
      await sequelize.query(`UPDATE projects SET is_organizational = true WHERE id = :projectId`, {
        replacements: { projectId },
      });
      const api = await apiAs(orgId, ownerId);

      expect((await api.get(`/api/v1/projects/${projectId}/raci`)).status).toBe(400);
    });

    it.each(["abc", "0", "-1", "1.5", "+1", "99999999999"])("rejects the id %s", async (id) => {
      const orgId = await createTestOrganization(`RACI bad id ${id}`);
      const api = await apiAs(orgId, await user(orgId));

      expect((await api.get(`/api/v1/projects/${id}/raci`)).status).toBe(400);
    });
  });

  describe("PUT /:id/raci/users/:userId", () => {
    async function setup() {
      const orgId = await createTestOrganization(`RACI write ${Date.now()}-${(counter += 1)}`);
      const ownerId = await user(orgId);
      const memberId = await user(orgId, 3);
      const projectId = await createTestProject(orgId, ownerId);
      await addMember(orgId, projectId, memberId);
      const api = await apiAs(orgId, ownerId);
      const url = (userId: number) => `/api/v1/projects/${projectId}/raci/users/${userId}`;
      return { orgId, ownerId, memberId, projectId, api, url };
    }

    it("refuses a role without useCase.edit", async () => {
      const { orgId, projectId, url, memberId } = await setup();
      const auditorId = await user(orgId, 4);
      await addMember(orgId, projectId, auditorId);
      const api = await apiAs(orgId, auditorId, 4);

      const res = await api.put(url(memberId)).send({ add: ["C"] });

      expect(res.status).toBe(403);
      expect(await overrides(projectId, memberId)).toEqual([]);
    });

    it("answers 404 to another organization and writes nothing", async () => {
      const { projectId, url, memberId } = await setup();
      const orgB = await createTestOrganization("RACI attacker");
      const api = await apiAs(orgB, await user(orgB));

      const res = await api.put(url(memberId)).send({ add: ["C"] });

      expect(res.status).toBe(404);
      expect(await overrides(projectId, memberId)).toEqual([]);
    });

    it("answers 404 to an editor who cannot see the use case", async () => {
      const { orgId, projectId, url, memberId } = await setup();
      const api = await apiAs(orgId, await user(orgId, 3), 3);

      const res = await api.put(url(memberId)).send({ add: ["C"] });

      expect(res.status).toBe(404);
      expect(await overrides(projectId, memberId)).toEqual([]);
    });

    it("answers 404 for a target outside the organization", async () => {
      const { api, url } = await setup();
      const orgB = await createTestOrganization("RACI other org");
      const stranger = await user(orgB);

      expect((await api.put(url(stranger)).send({ add: ["R"] })).status).toBe(404);
    });

    it("refuses an organizational use case", async () => {
      const { projectId, api, url, memberId } = await setup();
      await sequelize.query(`UPDATE projects SET is_organizational = true WHERE id = :projectId`, {
        replacements: { projectId },
      });

      expect((await api.put(url(memberId)).send({ add: ["R"] })).status).toBe(400);
    });

    it.each([
      ["no lists", {}],
      ["empty lists", { add: [], remove: [] }],
      ["add not a list", { add: "R" }],
      ["remove not a list", { remove: "R" }],
      ["null add", { add: null, remove: ["R"] }],
      ["unknown role", { add: ["X"] }],
      ["lower-case role", { remove: ["r"] }],
      ["non-string role", { add: [1] }],
      ["repeated role", { add: ["R", "R"] }],
      ["the same role in both lists", { add: ["R"], remove: ["R"] }],
    ])("rejects %s", async (_label, body) => {
      const { api, url, memberId } = await setup();

      expect((await api.put(url(memberId)).send(body)).status).toBe(400);
    });

    it("rejects a malformed user id", async () => {
      const { api, projectId } = await setup();

      const res = await api
        .put(`/api/v1/projects/${projectId}/raci/users/abc`)
        .send({ add: ["R"] });

      expect(res.status).toBe(400);
    });

    it("adds a person with a manual role and returns the matrix", async () => {
      const { orgId, projectId, api, url } = await setup();
      const newPerson = await user(orgId, 3);

      const res = await api.put(url(newPerson)).send({ add: ["C", "I"] });

      expect(res.status).toBe(200);
      expect(rowFor(res.body, newPerson).roles).toEqual([
        { role: "C", sources: ["manual"] },
        { role: "I", sources: ["manual"] },
      ]);
      expect(await overrides(projectId, newPerson)).toEqual([
        { raci_role: "C", state: "assigned" },
        { raci_role: "I", state: "assigned" },
      ]);
    });

    it("keeps a removed derived role removed across a re-read", async () => {
      const { projectId, api, url, memberId } = await setup();

      const removed = await api.put(url(memberId)).send({ remove: ["R"] });
      expect(removed.status).toBe(200);
      expect(rowFor(removed.body, memberId)).toBeUndefined();

      const reread = await api.get(`/api/v1/projects/${projectId}/raci`);
      expect(rowFor(reread.body, memberId)).toBeUndefined();
      expect(await overrides(projectId, memberId)).toEqual([{ raci_role: "R", state: "removed" }]);
    });

    it("deletes the override when the role is added back", async () => {
      const { projectId, api, url, memberId } = await setup();
      await api.put(url(memberId)).send({ remove: ["R"] });

      const restored = await api.put(url(memberId)).send({ add: ["R"] });

      expect(rowFor(restored.body, memberId).roles).toEqual([{ role: "R", sources: ["member"] }]);
      expect(await overrides(projectId, memberId)).toEqual([]);
    });

    it("warns about no accountable and multiple accountable without blocking", async () => {
      const { ownerId, memberId, api, url } = await setup();

      const none = await api.put(url(ownerId)).send({ remove: ["A"] });
      expect(none.status).toBe(200);
      expect(none.body.data.warnings).toEqual(["no_accountable"]);

      await api.put(url(ownerId)).send({ add: ["A"] });
      const two = await api.put(url(memberId)).send({ add: ["A"] });
      expect(two.status).toBe(200);
      expect(two.body.data.warnings).toEqual(["multiple_accountable"]);
    });

    it("keeps a role derived after the client last read the matrix", async () => {
      const { orgId, projectId, api, url } = await setup();
      const person = await user(orgId, 3);
      await api.put(url(person)).send({ add: ["I"] });
      const staleRead = await api.get(`/api/v1/projects/${projectId}/raci`);
      expect(rolesFor(staleRead.body, person)).toEqual(["I"]);

      // Becomes a member after that read, which derives R.
      await addMember(orgId, projectId, person);
      const toggled = await api.put(url(person)).send({ add: ["C"] });

      expect(toggled.status).toBe(200);
      expect(rolesFor(toggled.body, person)).toEqual(["R", "C", "I"]);
      expect(await overrides(projectId, person)).toEqual([
        { raci_role: "C", state: "assigned" },
        { raci_role: "I", state: "assigned" },
      ]);
    });

    it("keeps another editor's manual role when toggling a different one", async () => {
      const { orgId, ownerId, projectId, api, url, memberId } = await setup();
      const otherEditor = await apiAs(orgId, ownerId);

      await otherEditor.put(url(memberId)).send({ add: ["I"] });
      const toggled = await api.put(url(memberId)).send({ add: ["C"] });

      expect(rolesFor(toggled.body, memberId)).toEqual(["R", "C", "I"]);
      expect(await overrides(projectId, memberId)).toHaveLength(2);
    });

    it("applies add and remove in one request", async () => {
      const { api, url, memberId } = await setup();

      const res = await api.put(url(memberId)).send({ add: ["C"], remove: ["R"] });

      expect(res.status).toBe(200);
      expect(rolesFor(res.body, memberId)).toEqual(["C"]);
    });

    it("records the change in the use case history, and only real changes", async () => {
      const { projectId, api, url, memberId } = await setup();
      const history = async () => {
        const [rows] = await sequelize.query(
          `SELECT field_name, old_value, new_value FROM use_case_change_history
            WHERE use_case_id = :projectId AND field_name LIKE 'RACI:%'`,
          { replacements: { projectId } },
        );
        return rows as any[];
      };

      await api.put(url(memberId)).send({ add: ["C"] });
      await api.put(url(memberId)).send({ add: ["C"] });

      const rows = await history();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ old_value: "R", new_value: "R, C" });
    });

    it("stamps who made the change", async () => {
      const { ownerId, projectId, api, url, memberId } = await setup();
      await api.put(url(memberId)).send({ add: ["I"] });

      const [rows] = await sequelize.query(
        `SELECT updated_by FROM raci_entries WHERE project_id = :projectId AND raci_role = 'I'`,
        { replacements: { projectId } },
      );
      expect((rows as any[])[0].updated_by).toBe(ownerId);
    });

    it("drops a deleted user from the matrix and from the overrides", async () => {
      const { projectId, api, url, memberId } = await setup();
      await api.put(url(memberId)).send({ add: ["I"] });

      await sequelize.query(`DELETE FROM users WHERE id = :memberId`, {
        replacements: { memberId },
      });

      const reread = await api.get(`/api/v1/projects/${projectId}/raci`);
      expect(reread.status).toBe(200);
      expect(rowFor(reread.body, memberId)).toBeUndefined();
      expect(await overrides(projectId, memberId)).toEqual([]);
    });

    it("hides someone who left the organization even with an override", async () => {
      const { orgId, projectId, api, url, memberId } = await setup();
      await api.put(url(memberId)).send({ add: ["I"] });

      // A second membership keeps the account alive after leaving this organization.
      const otherOrg = await createTestOrganization("RACI other membership");
      await sequelize.query(
        `INSERT INTO organization_members (organization_id, user_id, role_id)
         VALUES (:otherOrg, :memberId, 3)`,
        { replacements: { otherOrg, memberId } },
      );
      await sequelize.transaction((transaction) =>
        removeUserFromOrganizationQuery(memberId, orgId, transaction),
      );

      const reread = await api.get(`/api/v1/projects/${projectId}/raci`);
      expect(rowFor(reread.body, memberId)).toBeUndefined();
      expect(await overrides(projectId, memberId)).toEqual([]);
    });

    it("hides an override of a user whose membership row is gone", async () => {
      const { orgId, projectId, api, url, memberId } = await setup();
      await api.put(url(memberId)).send({ add: ["I"] });
      const otherOrg = await createTestOrganization("RACI stray override");
      await sequelize.query(
        `INSERT INTO organization_members (organization_id, user_id, role_id)
         VALUES (:otherOrg, :memberId, 3)`,
        { replacements: { otherOrg, memberId } },
      );
      await sequelize.query(
        `DELETE FROM organization_members WHERE organization_id = :orgId AND user_id = :memberId`,
        { replacements: { orgId, memberId } },
      );

      const reread = await api.get(`/api/v1/projects/${projectId}/raci`);
      expect(rowFor(reread.body, memberId)).toBeUndefined();
      expect((await overrides(projectId, memberId)).length).toBeGreaterThan(0);
    });
  });
});
