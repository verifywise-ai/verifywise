jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  createTestModelInventory,
  createTestModelRisk,
  createTestProject,
  createTestProjectFramework,
} from "../factories/test-entities.factory";

/**
 * Use cases and models audit, PR C: a model's approver, use cases and
 * frameworks, and a model risk's model and owner must be the organization's;
 * dataset, evidence and snapshot writes need model.edit.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
const userIn = (orgId: number, role: RoleName) => {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `mtc-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
};
const as = async (orgId: number, userId: number, role: RoleName) =>
  testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );

const modelBody = (extra: Record<string, unknown> = {}) => ({
  provider: "Acme",
  model: `Model ${Date.now()}-${++counter}`,
  version: "1",
  capabilities: "Text",
  security_assessment: false,
  status: "Pending",
  status_date: new Date().toISOString(),
  reference_link: "https://example.com",
  biases: "None",
  limitations: "None",
  hosting_provider: "AWS",
  ...extra,
});

const riskBody = (extra: Record<string, unknown> = {}) => ({
  risk_name: `Risk ${++counter}`,
  risk_category: "Performance",
  risk_level: "Low",
  status: "Open",
  target_date: "2030-01-01",
  description: "d",
  ...extra,
});

const notificationsFor = async (userId: number) =>
  (
    await sequelize.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    )
  )[0].n;

describe("model tenant checks", () => {
  let orgA: number;
  let orgB: number;
  let adminA: number;
  let editorA: number;
  let auditorA: number;
  let adminB: number;
  let projectA: number;
  let projectB: number;
  let modelA: number;
  let modelB: number;

  beforeAll(async () => {
    await cleanupDatabase();
    await seedFrameworks();
    orgA = await createTestOrganization("Org A");
    orgB = await createTestOrganization("Org B");
    adminA = await userIn(orgA, "Admin");
    editorA = await userIn(orgA, "Editor");
    auditorA = await userIn(orgA, "Auditor");
    adminB = await userIn(orgB, "Admin");
    projectA = await createTestProject(orgA, adminA, {});
    projectB = await createTestProject(orgB, adminB, {});
    await createTestProjectFramework(orgA, projectA, 1);
    await createTestProjectFramework(orgB, projectB, 2);
    modelA = await createTestModelInventory(orgA, {});
    modelB = await createTestModelInventory(orgB, {});
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  describe("model approver (M-H2)", () => {
    it("refuses another organization's user as approver on create, and tells them nothing", async () => {
      const before = await notificationsFor(adminB);
      const res = await (
        await as(orgA, adminA, "Admin")
      )
        .post("/api/modelInventory")
        .send(modelBody({ approver: adminB }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/approver must be a member/);
      expect(await notificationsFor(adminB)).toBe(before);
    });

    it("accepts a member as approver (Editor)", async () => {
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .post("/api/modelInventory")
        .send(modelBody({ approver: adminA }));
      expect(res.status).toBe(201);
    });

    it("refuses an Auditor", async () => {
      const res = await (
        await as(orgA, auditorA, "Auditor")
      )
        .post("/api/modelInventory")
        .send(modelBody());
      expect(res.status).toBe(403);
    });

    it("refuses another organization's user as approver on update", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      )
        .patch(`/api/modelInventory/${modelA}`)
        .send(modelBody({ approver: adminB }));
      expect(res.status).toBe(400);
      const [row] = await sequelize.query<{ approver: number | null }>(
        `SELECT approver FROM model_inventories WHERE id = :id`,
        { replacements: { id: modelA }, type: QueryTypes.SELECT },
      );
      expect(row.approver).not.toBe(adminB);
    });

    it("gives another organization's Admin a 404 on the model", async () => {
      const res = await (
        await as(orgB, adminB, "Admin")
      )
        .patch(`/api/modelInventory/${modelA}`)
        .send(modelBody({ approver: adminB }));
      expect(res.status).toBe(404);
    });
  });

  describe("model links (M-M2)", () => {
    it("refuses another organization's use case", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      )
        .post("/api/modelInventory")
        .send(modelBody({ projects: [projectB] }));
      expect(res.status).toBe(400);
    });

    it("refuses a framework no use case of the organization uses (was a 500)", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      )
        .post("/api/modelInventory")
        .send(modelBody({ frameworks: [2] }));
      expect(res.status).toBe(400);
    });

    it("refuses a malformed id list", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      )
        .post("/api/modelInventory")
        .send(modelBody({ projects: ["1; drop"] }));
      expect(res.status).toBe(400);
    });

    it("stores a framework link without a use case, and the use case does not list it", async () => {
      const api = await as(orgA, adminA, "Admin");
      const res = await api.post("/api/modelInventory").send(modelBody({ frameworks: [1, 1] }));
      expect(res.status).toBe(201);
      const id = res.body.data.id;
      const rows = await sequelize.query<{ project_id: number | null; framework_id: number }>(
        `SELECT project_id, framework_id FROM model_inventories_projects_frameworks WHERE model_inventory_id = :id`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      expect(rows).toEqual([{ project_id: null, framework_id: 1 }]);

      const one = await api.get(`/api/modelInventory/${id}`);
      expect(one.body.data.frameworks).toEqual([1]);
      expect(one.body.data.projects).toEqual([]);

      const byProject = await api.get(`/api/modelInventory/by-projectId/${projectA}`);
      expect((byProject.body.data ?? []).map((m: any) => m.id)).not.toContain(id);
      const byFramework = await api.get(`/api/modelInventory/by-frameworkId/1`);
      expect(byFramework.body.data.map((m: any) => m.id)).toContain(id);
    });

    it("updating use case links leaves framework links alone", async () => {
      const api = await as(orgA, adminA, "Admin");
      const created = await api.post("/api/modelInventory").send(modelBody({ frameworks: [1] }));
      const id = created.body.data.id;
      const res = await api
        .patch(`/api/modelInventory/${id}`)
        .send(modelBody({ projects: [projectA] }));
      expect(res.status).toBe(200);
      expect(res.body.data.projects).toEqual([projectA]);
      expect(res.body.data.frameworks).toEqual([1]);
    });
  });

  describe("model risk references (M-M1)", () => {
    it("refuses another organization's model", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      )
        .post("/api/modelRisks")
        .send(riskBody({ model_id: modelB }));
      expect(res.status).toBe(400);
    });

    it("refuses another organization's user as owner", async () => {
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .post("/api/modelRisks")
        .send(riskBody({ model_id: modelA, owner: adminB }));
      expect(res.status).toBe(400);
    });

    it("accepts the organization's model and owner, and refuses changing them to foreign ones", async () => {
      const api = await as(orgA, editorA, "Editor");
      const created = await api
        .post("/api/modelRisks")
        .send(riskBody({ model_id: modelA, owner: editorA }));
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect((await api.patch(`/api/modelRisks/${id}`).send({ model_id: modelB })).status).toBe(
        400,
      );
      expect((await api.patch(`/api/modelRisks/${id}`).send({ owner: adminB })).status).toBe(400);
      expect((await api.patch(`/api/modelRisks/${id}`).send({ risk_name: "Renamed" })).status).toBe(
        200,
      );
    });

    it("refuses an Auditor and gives another organization's Admin a 404", async () => {
      const risk = await createTestModelRisk(orgA, { model_id: modelA });
      expect(
        (
          await (
            await as(orgA, auditorA, "Auditor")
          )
            .patch(`/api/modelRisks/${risk}`)
            .send({ risk_name: "x" })
        ).status,
      ).toBe(403);
      expect(
        (
          await (
            await as(orgB, adminB, "Admin")
          )
            .patch(`/api/modelRisks/${risk}`)
            .send({ risk_name: "x" })
        ).status,
      ).toBe(404);
    });
  });

  describe("dataset, evidence and snapshot writes (M-H3, M-L2)", () => {
    it.each([
      ["post", "/api/datasets"],
      ["patch", "/api/datasets/1"],
      ["delete", "/api/datasets/1"],
      ["post", "/api/evidenceHub"],
      ["patch", "/api/evidenceHub/1"],
      ["delete", "/api/evidenceHub/1"],
      ["post", "/api/modelInventoryHistory/snapshot"],
    ])("an Auditor gets 403 on %s %s", async (method, path) => {
      const api = (await as(orgA, auditorA, "Auditor")) as any;
      const res = await api[method](path).send({ parameter: "status" });
      expect(res.status).toBe(403);
    });

    it("an Editor passes the permission check on evidence create", async () => {
      const res = await (await as(orgA, editorA, "Editor")).post("/api/evidenceHub").send({});
      expect(res.status).not.toBe(403);
    });

    it("a snapshot of an unknown parameter is a 400 (was a 500)", async () => {
      const api = await as(orgA, adminA, "Admin");
      expect(
        (await api.post("/api/modelInventoryHistory/snapshot").send({ parameter: "owner" })).status,
      ).toBe(400);
      expect(
        (await api.post("/api/modelInventoryHistory/snapshot").send({ parameter: "status" }))
          .status,
      ).toBe(201);
    });
  });
});
