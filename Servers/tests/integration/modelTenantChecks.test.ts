jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { invalidateRolePermissionsCache } from "../../utils/rolePermissions.utils";
import { invalidateRoleMapCache } from "../../utils/roleMap";
import {
  createTestModelInventory,
  createTestModelRisk,
  createTestProject,
  createTestProjectFramework,
  createTestRisk,
} from "../factories/test-entities.factory";

/**
 * Use cases and models audit, PR C: a model's approver, use cases and
 * frameworks, and a model risk's model and owner must be the organization's;
 * dataset and snapshot writes need model.edit; an evidence write needs one of
 * model.edit, training.edit or risks.edit, plus the key of each link it sets
 * or the evidence already has.
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

/** A custom role of the organization holding only `permissions`. */
async function customRole(orgId: number, name: string, permissions: string[]): Promise<string> {
  const [{ id }] = await sequelize.query<{ id: number }>(
    `INSERT INTO roles (name, description, organization_id, created_at)
     VALUES (:name, 'Custom', :orgId, NOW()) RETURNING id`,
    { replacements: { name, orgId }, type: QueryTypes.SELECT },
  );
  for (const key of permissions) {
    await sequelize.query(
      `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
       VALUES (:orgId, :id, :key, TRUE)`,
      { replacements: { orgId, id, key } },
    );
  }
  // Inserting by SQL bypasses the role API, which clears both caches.
  invalidateRoleMapCache();
  invalidateRolePermissionsCache();
  return name;
}

async function createTraining(orgId: number): Promise<number> {
  const [{ id }] = await sequelize.query<{ id: number }>(
    `INSERT INTO trainingregistar (organization_id, training_name)
     VALUES (:orgId, :name) RETURNING id`,
    { replacements: { orgId, name: `Training ${++counter}` }, type: QueryTypes.SELECT },
  );
  return id;
}

const evidenceRemovedRows = async (modelId: number) =>
  (
    await sequelize.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM model_inventory_change_history
        WHERE model_inventory_id = :modelId AND field_name = 'Evidence removed'`,
      { replacements: { modelId }, type: QueryTypes.SELECT },
    )
  )[0].n;

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
  let riskA: number;
  let riskB: number;
  let trainingA: number;
  let trainingB: number;

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
    riskA = await createTestRisk(orgA, {});
    riskB = await createTestRisk(orgB, {});
    trainingA = await createTraining(orgA);
    trainingB = await createTraining(orgB);
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
      ["post", "/api/modelInventoryHistory/snapshot"],
    ])("an Auditor gets 403 on %s %s", async (method, path) => {
      const api = (await as(orgA, auditorA, "Auditor")) as any;
      const res = await api[method](path).send({ parameter: "status" });
      expect(res.status).toBe(403);
    });

    it("an Auditor cannot create, change or delete evidence, linked or not", async () => {
      const auditor = await as(orgA, auditorA, "Auditor");
      const body = { evidence_name: `Note ${++counter}`, evidence_type: "Other" };
      expect((await auditor.post("/api/evidenceHub").send(body)).status).toBe(403);
      expect(
        (await auditor.post("/api/evidenceHub").send({ ...body, mapped_model_ids: [modelA] }))
          .status,
      ).toBe(403);

      const created = await (await as(orgA, editorA, "Editor")).post("/api/evidenceHub").send(body);
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect(
        (await auditor.patch(`/api/evidenceHub/${id}`).send({ evidence_name: "x" })).status,
      ).toBe(403);
      expect((await auditor.delete(`/api/evidenceHub/${id}`)).status).toBe(403);
    });

    it("a training.edit-only role writes training evidence but not model evidence", async () => {
      const role = await customRole(orgA, `Trainer ${++counter}`, ["training.edit"]);
      const trainer = await userIn(orgA, "Editor");
      const api = testRequest(
        await createTestApp({
          bypassAuth: true,
          mockUser: { userId: trainer, organizationId: orgA, role },
        }),
      );
      const training = { evidence_name: `Certificate ${++counter}`, evidence_type: "Training" };

      const created = await api
        .post("/api/evidenceHub")
        .send({ ...training, mapped_training_ids: [trainingA] });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect(
        (await api.patch(`/api/evidenceHub/${id}`).send({ evidence_name: "Renamed" })).status,
      ).toBe(200);
      // Adding a model link changes the model: model.edit.
      expect(
        (await api.patch(`/api/evidenceHub/${id}`).send({ mapped_model_ids: [modelA] })).status,
      ).toBe(403);
      expect(
        (await api.post("/api/evidenceHub").send({ ...training, mapped_model_ids: [modelA] }))
          .status,
      ).toBe(403);
      expect((await api.delete(`/api/evidenceHub/${id}`)).status).toBe(200);

      // Evidence an Editor linked to a model stays out of the trainer's reach.
      const modelEvidence = await (
        await as(orgA, editorA, "Editor")
      )
        .post("/api/evidenceHub")
        .send({ ...training, mapped_model_ids: [modelA] });
      expect(modelEvidence.status).toBe(201);
      expect((await api.delete(`/api/evidenceHub/${modelEvidence.body.data.id}`)).status).toBe(403);
    });

    it.each([
      ["mapped_model_ids", "1"],
      ["mapped_model_ids", ["1"]],
      ["mapped_risk_ids", [0]],
      ["mapped_training_ids", [-1]],
      ["mapped_model_ids", [1.5]],
    ])("refuses a malformed %s (%j) with 400, even for an Auditor", async (field, value) => {
      const body = { evidence_name: `Bad ${++counter}`, evidence_type: "Other", [field]: value };
      for (const [user, role] of [
        [editorA, "Editor"],
        [auditorA, "Auditor"],
      ] as const) {
        const res = await (await as(orgA, user, role)).post("/api/evidenceHub").send(body);
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toMatch(new RegExp(`${field} must be a list of ids`));
      }
    });

    it("refuses linking evidence to another organization's model, risk or training", async () => {
      const api = await as(orgA, adminA, "Admin");
      const name = () => `Linked ${++counter}`;
      for (const [field, id] of [
        ["mapped_model_ids", modelB],
        ["mapped_risk_ids", riskB],
        ["mapped_training_ids", trainingB],
      ] as const) {
        const res = await api
          .post("/api/evidenceHub")
          .send({ evidence_name: name(), evidence_type: "Other", [field]: [id] });
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toMatch(/was not found in this organization/);
      }
      const [{ n }] = await sequelize.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM evidence_hub
          WHERE :modelB = ANY(mapped_model_ids) OR :riskB = ANY(mapped_risk_ids)
             OR :trainingB = ANY(mapped_training_ids)`,
        { replacements: { modelB, riskB, trainingB }, type: QueryTypes.SELECT },
      );
      expect(Number(n)).toBe(0);

      // The organization's own ids are accepted.
      for (const [field, id] of [
        ["mapped_model_ids", modelA],
        ["mapped_risk_ids", riskA],
        ["mapped_training_ids", trainingA],
      ] as const) {
        const res = await api
          .post("/api/evidenceHub")
          .send({ evidence_name: name(), evidence_type: "Other", [field]: [id] });
        expect(res.status).toBe(201);
      }
    });

    it("refuses adding another organization's model on update, and keeps the links", async () => {
      const api = await as(orgA, adminA, "Admin");
      const created = await api.post("/api/evidenceHub").send({
        evidence_name: `Update ${++counter}`,
        evidence_type: "Other",
        mapped_model_ids: [modelA],
      });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const res = await api
        .patch(`/api/evidenceHub/${id}`)
        .send({ mapped_model_ids: [modelA, modelB] });
      expect(res.status).toBe(400);
      const [row] = await sequelize.query<{ mapped_model_ids: number[] }>(
        `SELECT mapped_model_ids FROM evidence_hub WHERE id = :id`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      expect(row.mapped_model_ids).toEqual([modelA]);
    });

    it("a rename without mapped_model_ids keeps the links and records no removal", async () => {
      const api = await as(orgA, adminA, "Admin");
      const model = await createTestModelInventory(orgA, {});
      const created = await api.post("/api/evidenceHub").send({
        evidence_name: `History ${++counter}`,
        evidence_type: "Other",
        mapped_model_ids: [model],
      });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const res = await api.patch(`/api/evidenceHub/${id}`).send({ evidence_name: "Renamed" });
      expect(res.status).toBe(200);
      expect(res.body.data.mapped_model_ids).toEqual([model]);
      expect(Number(await evidenceRemovedRows(model))).toBe(0);

      // Clearing the links does record the removal.
      expect(
        (await api.patch(`/api/evidenceHub/${id}`).send({ mapped_model_ids: null })).status,
      ).toBe(200);
      expect(Number(await evidenceRemovedRows(model))).toBe(1);
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
