jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  createTestModelInventory,
  createTestProject,
  linkModelToProject,
} from "../factories/test-entities.factory";

/**
 * Linking AI apps and use cases, and creating an AI app from a use case (#5259):
 * authentication, permission, tenancy, use case visibility and the data rules.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `link-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function as(orgId: number, userId: number, role: RoleName) {
  return testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
}

async function aiApp(orgId: number, ownerId: number, name?: string): Promise<number> {
  counter += 1;
  const [rows] = await sequelize.query(
    `INSERT INTO ai_apps (organization_id, name, owner_id, status)
     VALUES (:orgId, :name, :ownerId, 'approved') RETURNING id`,
    { replacements: { orgId, ownerId, name: name ?? `App ${Date.now()}-${counter}` } },
  );
  return Number((rows as any[])[0].id);
}

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId } },
  );
}

async function setProject(id: number, set: string): Promise<void> {
  await sequelize.query(`UPDATE projects SET ${set} WHERE id = :id`, { replacements: { id } });
}

async function link(orgId: number, appId: number, projectId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO ai_apps_projects (ai_app_id, project_id, organization_id)
     VALUES (:appId, :projectId, :orgId)`,
    { replacements: { appId, projectId, orgId } },
  );
}

async function scalar(sql: string, replacements: Record<string, unknown>): Promise<number> {
  const [rows] = await sequelize.query(sql, { replacements });
  return Number((rows as any[])[0].total);
}

const linkCount = (projectId: number) =>
  scalar(`SELECT COUNT(*) AS total FROM ai_apps_projects WHERE project_id = :projectId`, {
    projectId,
  });
const appCount = (orgId: number) =>
  scalar(`SELECT COUNT(*) AS total FROM ai_apps WHERE organization_id = :orgId`, { orgId });

async function history(appId: number): Promise<any[]> {
  const [rows] = await sequelize.query(
    `SELECT action, field_name, old_value, new_value, changed_by_user_id
       FROM ai_app_change_history WHERE ai_app_id = :appId AND field_name LIKE '%use case%'
      ORDER BY id`,
    { replacements: { appId } },
  );
  return rows as any[];
}

describe("AI app and use case links", () => {
  let orgId: number;
  let adminId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    adminId = await userIn(orgId, "Admin");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("authentication and permission", () => {
    const endpoints: Array<["get" | "post" | "delete", string]> = [
      ["post", "/api/v1/projects/1/create-ai-app"],
      ["get", "/api/v1/projects/1/create-ai-app"],
      ["get", "/api/v1/projects/1/ai-apps"],
      ["get", "/api/v1/ai-apps/1/use-cases"],
      ["post", "/api/v1/ai-apps/1/use-cases"],
      ["delete", "/api/v1/ai-apps/1/use-cases/1"],
    ];

    it.each(endpoints)("%s %s refuses a request with no token", async (method, path) => {
      const api = testRequest(await createTestApp());
      const res = await api[method](path);
      expect([400, 401]).toContain(res.status);
    });

    it.each(["Auditor", "Reviewer"] as const)("refuses writes from a %s", async (role) => {
      const userId = await userIn(orgId, role);
      const appId = await aiApp(orgId, adminId);
      const projectId = await createTestProject(orgId, userId);
      await link(orgId, appId, projectId);
      const api = await as(orgId, userId, role);

      expect((await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({})).status).toBe(
        403,
      );
      expect((await api.get(`/api/v1/projects/${projectId}/create-ai-app`)).status).toBe(403);
      expect(
        (await api.post(`/api/v1/ai-apps/${appId}/use-cases`).send({ project_id: projectId }))
          .status,
      ).toBe(403);
      expect((await api.delete(`/api/v1/ai-apps/${appId}/use-cases/${projectId}`)).status).toBe(
        403,
      );
      expect(await linkCount(projectId)).toBe(1);
    });

    it("lets every signed-in role read the links they may see", async () => {
      const userId = await userIn(orgId, "Auditor");
      const appId = await aiApp(orgId, adminId);
      const projectId = await createTestProject(orgId, userId);
      await link(orgId, appId, projectId);
      const api = await as(orgId, userId, "Auditor");

      expect((await api.get(`/api/v1/projects/${projectId}/ai-apps`)).status).toBe(200);
      expect((await api.get(`/api/v1/ai-apps/${appId}/use-cases`)).status).toBe(200);
    });
  });

  describe("id validation", () => {
    it.each(["abc", "0", "-1", "2147483648", "1.5"])("answers 400 for id %s", async (bad) => {
      const api = await as(orgId, adminId, "Admin");
      expect((await api.get(`/api/v1/projects/${bad}/ai-apps`)).status).toBe(400);
      expect((await api.post(`/api/v1/projects/${bad}/create-ai-app`).send({})).status).toBe(400);
      expect((await api.get(`/api/v1/ai-apps/${bad}/use-cases`)).status).toBe(400);
      expect(
        (await api.post(`/api/v1/ai-apps/${bad}/use-cases`).send({ project_id: 1 })).status,
      ).toBe(400);
      expect((await api.delete(`/api/v1/ai-apps/${bad}/use-cases/1`)).status).toBe(400);
      expect((await api.delete(`/api/v1/ai-apps/1/use-cases/${bad}`)).status).toBe(400);
    });

    it.each([[undefined], ["abc"], [0], [1.5], [[1]]])(
      "answers 400 for body project_id %p",
      async (projectId) => {
        const appId = await aiApp(orgId, adminId);
        const api = await as(orgId, adminId, "Admin");
        expect(
          (await api.post(`/api/v1/ai-apps/${appId}/use-cases`).send({ project_id: projectId }))
            .status,
        ).toBe(400);
      },
    );
  });

  describe("POST /projects/:id/create-ai-app", () => {
    it("copies the use case into a draft AI app and links them", async () => {
      await seedFrameworks();
      const projectId = await createTestProject(orgId, adminId, {
        project_title: "Fraud scoring",
        uc_id: "UC-7",
      });
      await setProject(projectId, "description = 'Scores payments', is_demo = true");
      const modelA = await createTestModelInventory(orgId);
      const modelB = await createTestModelInventory(orgId, { model: "Other" });
      // One model under two frameworks: two rows, one dependency.
      await linkModelToProject(orgId, modelA, projectId, 1);
      await linkModelToProject(orgId, modelA, projectId, 2);
      await linkModelToProject(orgId, modelB, projectId, 1);
      const api = await as(orgId, adminId, "Admin");

      const preview = await api.get(`/api/v1/projects/${projectId}/create-ai-app`);
      expect(preview.status).toBe(200);
      expect(preview.body.data).toEqual({ model_count: 2 });

      const res = await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({});

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: "Fraud scoring",
        description: "Scores payments",
        owner_id: adminId,
        status: "draft",
        discovered_source: "manual",
        is_demo: true,
      });
      expect(res.body.data.models.map((m: any) => m.id).sort()).toEqual([modelA, modelB].sort());
      expect(await linkCount(projectId)).toBe(1);
      expect(await history(res.body.data.id)).toEqual([
        expect.objectContaining({
          action: "created",
          field_name: "Created from use case",
          new_value: "UC-7: Fraud scoring",
          changed_by_user_id: adminId,
        }),
      ]);
    });

    it("uses the trimmed name when one is given, and the title for a blank one", async () => {
      const first = await createTestProject(orgId, adminId, { project_title: "One" });
      const second = await createTestProject(orgId, adminId, { project_title: "Two" });
      const api = await as(orgId, adminId, "Admin");

      const named = await api
        .post(`/api/v1/projects/${first}/create-ai-app`)
        .send({ name: "  Custom name " });
      expect(named.status).toBe(201);
      expect(named.body.data.name).toBe("Custom name");

      const blank = await api
        .post(`/api/v1/projects/${second}/create-ai-app`)
        .send({ name: "   " });
      expect(blank.status).toBe(201);
      expect(blank.body.data.name).toBe("Two");
    });

    it.each([["x".repeat(256)], [42], [["a"]]])("answers 400 for name %#", async (name) => {
      const projectId = await createTestProject(orgId, adminId);
      const api = await as(orgId, adminId, "Admin");
      const res = await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({ name });
      expect(res.status).toBe(400);
      expect(await appCount(orgId)).toBe(0);
    });

    it("gives an externally owned use case's AI app to the caller", async () => {
      const editorId = await userIn(orgId, "Editor");
      const projectId = await createTestProject(orgId, adminId);
      await setProject(
        projectId,
        `owner = NULL, external_owner_name = 'Ada', external_owner_email = 'ada@example.com'`,
      );
      await addMember(orgId, projectId, editorId);
      const api = await as(orgId, editorId, "Editor");

      const res = await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({});

      expect(res.status).toBe(201);
      expect(res.body.data.owner_id).toBe(editorId);
    });

    it("falls back to the caller when the owner is not in this organization", async () => {
      const otherOrg = await createTestOrganization("Elsewhere");
      const outsider = await userIn(otherOrg, "Admin");
      const projectId = await createTestProject(orgId, outsider);
      const api = await as(orgId, adminId, "Admin");

      const res = await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({});

      expect(res.status).toBe(201);
      expect(res.body.data.owner_id).toBe(adminId);
    });

    it("answers 409 for a taken name and leaves no app and no link", async () => {
      await aiApp(orgId, adminId, "Taken");
      const projectId = await createTestProject(orgId, adminId, { project_title: "Taken" });
      const api = await as(orgId, adminId, "Admin");

      const res = await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({});

      expect(res.status).toBe(409);
      expect(res.body.data).toBe("An AI app with this name already exists");
      expect(await appCount(orgId)).toBe(1);
      expect(await linkCount(projectId)).toBe(0);
    });

    it("refuses an organizational use case", async () => {
      const projectId = await createTestProject(orgId, adminId);
      await setProject(projectId, "is_organizational = true");
      const api = await as(orgId, adminId, "Admin");

      const res = await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({});

      expect(res.status).toBe(400);
      expect(await appCount(orgId)).toBe(0);
    });

    it("answers 404 to a non-member non-admin and creates nothing", async () => {
      const editorId = await userIn(orgId, "Editor");
      const projectId = await createTestProject(orgId, adminId);
      const api = await as(orgId, editorId, "Editor");

      expect((await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({})).status).toBe(
        404,
      );
      expect((await api.get(`/api/v1/projects/${projectId}/create-ai-app`)).status).toBe(404);
      expect(await appCount(orgId)).toBe(0);
    });

    it("answers 404 across organizations", async () => {
      const otherOrg = await createTestOrganization("Other");
      const otherAdmin = await userIn(otherOrg, "Admin");
      const projectId = await createTestProject(orgId, adminId);
      const api = await as(otherOrg, otherAdmin, "Admin");

      expect((await api.post(`/api/v1/projects/${projectId}/create-ai-app`).send({})).status).toBe(
        404,
      );
      expect(await appCount(otherOrg)).toBe(0);
    });
  });

  describe("GET /projects/:id/ai-apps", () => {
    it("lists the linked apps with their status and stage", async () => {
      const projectId = await createTestProject(orgId, adminId);
      const appId = await aiApp(orgId, adminId, "Assistant");
      await aiApp(orgId, adminId, "Not linked");
      await link(orgId, appId, projectId);
      const api = await as(orgId, adminId, "Admin");

      const res = await api.get(`/api/v1/projects/${projectId}/ai-apps`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        { id: appId, name: "Assistant", status: "approved", lifecycle_stage: "planned" },
      ]);
    });

    it("answers 404 to someone who cannot see the use case, and across organizations", async () => {
      const editorId = await userIn(orgId, "Editor");
      const projectId = await createTestProject(orgId, adminId);
      expect(
        (await (await as(orgId, editorId, "Editor")).get(`/api/v1/projects/${projectId}/ai-apps`))
          .status,
      ).toBe(404);

      const otherOrg = await createTestOrganization("Other");
      const otherAdmin = await userIn(otherOrg, "Admin");
      expect(
        (
          await (
            await as(otherOrg, otherAdmin, "Admin")
          ).get(`/api/v1/projects/${projectId}/ai-apps`)
        ).status,
      ).toBe(404);
    });
  });

  describe("GET /ai-apps/:id/use-cases", () => {
    it("lists only what the caller can see and counts the rest", async () => {
      const editorId = await userIn(orgId, "Editor");
      const appId = await aiApp(orgId, adminId);
      const visible = await createTestProject(orgId, adminId, {
        project_title: "Visible",
        uc_id: "UC-1",
      });
      await addMember(orgId, visible, editorId);
      const hiddenA = await createTestProject(orgId, adminId);
      const hiddenB = await createTestProject(orgId, adminId);
      await link(orgId, appId, visible);
      await link(orgId, appId, hiddenA);
      await link(orgId, appId, hiddenB);

      const editor = await (
        await as(orgId, editorId, "Editor")
      ).get(`/api/v1/ai-apps/${appId}/use-cases`);
      expect(editor.status).toBe(200);
      expect(editor.body.data).toEqual({
        use_cases: [
          { id: visible, uc_id: "UC-1", project_title: "Visible", status: "Not started" },
        ],
        hidden_count: 2,
      });

      const admin = await (
        await as(orgId, adminId, "Admin")
      ).get(`/api/v1/ai-apps/${appId}/use-cases`);
      expect(admin.body.data.use_cases).toHaveLength(3);
      expect(admin.body.data.hidden_count).toBe(0);
    });

    it("answers 404 for an app in another organization", async () => {
      const appId = await aiApp(orgId, adminId);
      const otherOrg = await createTestOrganization("Other");
      const otherAdmin = await userIn(otherOrg, "Admin");
      const res = await (
        await as(otherOrg, otherAdmin, "Admin")
      ).get(`/api/v1/ai-apps/${appId}/use-cases`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST and DELETE /ai-apps/:id/use-cases", () => {
    it("links idempotently, records it once, then unlinks", async () => {
      const appId = await aiApp(orgId, adminId);
      const projectId = await createTestProject(orgId, adminId, {
        project_title: "Claims",
        uc_id: "UC-9",
      });
      const api = await as(orgId, adminId, "Admin");

      for (let i = 0; i < 2; i += 1) {
        const res = await api
          .post(`/api/v1/ai-apps/${appId}/use-cases`)
          .send({ project_id: projectId });
        expect(res.status).toBe(201);
      }
      expect(await linkCount(projectId)).toBe(1);

      const removed = await api.delete(`/api/v1/ai-apps/${appId}/use-cases/${projectId}`);
      expect(removed.status).toBe(200);
      expect(await linkCount(projectId)).toBe(0);

      expect((await api.delete(`/api/v1/ai-apps/${appId}/use-cases/${projectId}`)).status).toBe(
        404,
      );

      expect(await history(appId)).toEqual([
        expect.objectContaining({
          action: "updated",
          field_name: "Linked use case",
          old_value: "-",
          new_value: "UC-9: Claims",
        }),
        expect.objectContaining({
          action: "updated",
          field_name: "Linked use case",
          old_value: "UC-9: Claims",
          new_value: "-",
        }),
      ]);
    });

    it("refuses an organizational use case", async () => {
      const appId = await aiApp(orgId, adminId);
      const projectId = await createTestProject(orgId, adminId);
      await setProject(projectId, "is_organizational = true");
      const api = await as(orgId, adminId, "Admin");
      expect(
        (await api.post(`/api/v1/ai-apps/${appId}/use-cases`).send({ project_id: projectId }))
          .status,
      ).toBe(400);
      expect(await linkCount(projectId)).toBe(0);
    });

    it("answers 404 to a non-member non-admin on link and unlink", async () => {
      const editorId = await userIn(orgId, "Editor");
      const appId = await aiApp(orgId, adminId);
      const projectId = await createTestProject(orgId, adminId);
      await link(orgId, appId, projectId);
      const api = await as(orgId, editorId, "Editor");

      expect(
        (await api.post(`/api/v1/ai-apps/${appId}/use-cases`).send({ project_id: projectId }))
          .status,
      ).toBe(404);
      expect((await api.delete(`/api/v1/ai-apps/${appId}/use-cases/${projectId}`)).status).toBe(
        404,
      );
      expect(await linkCount(projectId)).toBe(1);
    });

    it("answers 404 across organizations in either direction", async () => {
      const appId = await aiApp(orgId, adminId);
      const projectId = await createTestProject(orgId, adminId);
      const otherOrg = await createTestOrganization("Other");
      const otherAdmin = await userIn(otherOrg, "Admin");
      const otherApp = await aiApp(otherOrg, otherAdmin);
      const otherProject = await createTestProject(otherOrg, otherAdmin);
      const api = await as(otherOrg, otherAdmin, "Admin");

      expect(
        (await api.post(`/api/v1/ai-apps/${appId}/use-cases`).send({ project_id: otherProject }))
          .status,
      ).toBe(404);
      expect(
        (await api.post(`/api/v1/ai-apps/${otherApp}/use-cases`).send({ project_id: projectId }))
          .status,
      ).toBe(404);
      expect(await linkCount(projectId)).toBe(0);
      expect(await linkCount(otherProject)).toBe(0);
    });
  });
});
