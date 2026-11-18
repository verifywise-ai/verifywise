jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  createTestModelInventory,
  createTestProject,
  createTestProjectFramework,
} from "../factories/test-entities.factory";

/**
 * /api/modelInventory and use case access (audit M-M4, decision 8): the
 * inventory is visible to the whole organization; the model list of a use
 * case, and linking a model to a use case or unlinking it, need access to
 * that use case. A link to a use case the caller cannot open is kept when
 * the caller's list leaves it out. A framework link outlives the last use
 * case using the framework, so saving the model keeps working.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
const userIn = (orgId: number, role: RoleName) => {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `miuca-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
};
const as = async (orgId: number, userId: number, role: RoleName) =>
  testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );

const modelBody = (extra: Record<string, unknown> = {}) => ({
  provider: "Acme",
  model: `UCA model ${Date.now()}-${++counter}`,
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

const directLinks = async (modelId: number) =>
  (
    await sequelize.query<{ project_id: number }>(
      `SELECT project_id FROM model_inventories_projects_frameworks
        WHERE model_inventory_id = :modelId AND framework_id IS NULL ORDER BY project_id`,
      { replacements: { modelId }, type: QueryTypes.SELECT },
    )
  ).map((r) => r.project_id);

describe("/api/modelInventory use case access", () => {
  let orgA: number;
  let orgB: number;
  let adminA: number;
  let editorA: number;
  let auditorA: number;
  let adminB: number;
  let hidden: number; // the Editor is not a member
  let own: number; // the Editor owns it
  let model: number;

  const resetLinks = async () => {
    await sequelize.query(
      `DELETE FROM model_inventories_projects_frameworks WHERE model_inventory_id = :model`,
      { replacements: { model } },
    );
    await sequelize.query(
      `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
       VALUES (:orgA, :model, :hidden)`,
      { replacements: { orgA, model, hidden } },
    );
  };

  beforeAll(async () => {
    await cleanupDatabase();
    await seedFrameworks();
    orgA = await createTestOrganization("UCA A");
    orgB = await createTestOrganization("UCA B");
    adminA = await userIn(orgA, "Admin");
    editorA = await userIn(orgA, "Editor");
    auditorA = await userIn(orgA, "Auditor");
    adminB = await userIn(orgB, "Admin");
    hidden = await createTestProject(orgA, adminA, {});
    own = await createTestProject(orgA, editorA, {});
    model = await createTestModelInventory(orgA, {});
  });

  beforeEach(resetLinks);

  afterAll(async () => {
    await cleanupDatabase();
  });

  describe("GET /by-projectId/:projectId", () => {
    it("refuses a use case the caller cannot open", async () => {
      const res = await (
        await as(orgA, editorA, "Editor")
      ).get(`/api/modelInventory/by-projectId/${hidden}`);
      expect(res.status).toBe(403);
    });

    it("lists the use case's models for an Admin", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      ).get(`/api/modelInventory/by-projectId/${hidden}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((m: any) => m.id)).toEqual([model]);
    });

    it("never shows another organization's use case", async () => {
      const res = await (
        await as(orgB, adminB, "Admin")
      ).get(`/api/modelInventory/by-projectId/${hidden}`);
      expect((res.body.data ?? []).map((m: any) => m.id)).not.toContain(model);
    });

    it("keeps the inventory itself visible to the whole organization", async () => {
      const res = await (await as(orgA, editorA, "Editor")).get(`/api/modelInventory/${model}`);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /", () => {
    it("refuses an Editor linking a use case they cannot open, and writes nothing", async () => {
      const name = `Refused ${Date.now()}`;
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .post("/api/modelInventory")
        .send(modelBody({ model: name, projects: [hidden] }));
      expect(res.status).toBe(403);
      const rows = await sequelize.query(`SELECT id FROM model_inventories WHERE model = :name`, {
        replacements: { name },
        type: QueryTypes.SELECT,
      });
      expect(rows).toHaveLength(0);
    });

    it("lets an Editor link their own use case", async () => {
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .post("/api/modelInventory")
        .send(modelBody({ projects: [own] }));
      expect(res.status).toBe(201);
      expect(await directLinks(res.body.data.id)).toEqual([own]);
    });

    it("refuses an Auditor, and another organization's use case", async () => {
      expect(
        (await (await as(orgA, auditorA, "Auditor")).post("/api/modelInventory").send(modelBody()))
          .status,
      ).toBe(403);
      const other = await createTestProject(orgB, adminB, {});
      expect(
        (
          await (
            await as(orgA, adminA, "Admin")
          )
            .post("/api/modelInventory")
            .send(modelBody({ projects: [other] }))
        ).status,
      ).toBe(400);
    });
  });

  describe("PATCH /:id", () => {
    it("keeps a link to a use case the Editor cannot open when their list leaves it out", async () => {
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .patch(`/api/modelInventory/${model}`)
        .send(modelBody({ projects: [own] }));
      expect(res.status).toBe(200);
      expect(await directLinks(model)).toEqual([hidden, own].sort((a, b) => a - b));
    });

    it("keeps the hidden link when the Editor clears their list", async () => {
      await sequelize.query(
        `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
         VALUES (:orgA, :model, :own)`,
        { replacements: { orgA, model, own } },
      );
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .patch(`/api/modelInventory/${model}`)
        .send(modelBody({ projects: [], deleteProjects: true }));
      expect(res.status).toBe(200);
      expect(await directLinks(model)).toEqual([hidden]);
    });

    it("refuses an Editor adding a use case they cannot open", async () => {
      const other = await createTestModelInventory(orgA, {});
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .patch(`/api/modelInventory/${other}`)
        .send(modelBody({ projects: [hidden] }));
      expect(res.status).toBe(403);
      expect(await directLinks(other)).toEqual([]);
    });

    it("lets an Admin unlink any use case", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      )
        .patch(`/api/modelInventory/${model}`)
        .send(modelBody({ projects: [own] }));
      expect(res.status).toBe(200);
      expect(await directLinks(model)).toEqual([own]);
    });

    it("gives another organization's Admin a 404", async () => {
      const res = await (
        await as(orgB, adminB, "Admin")
      )
        .patch(`/api/modelInventory/${model}`)
        .send(modelBody());
      expect(res.status).toBe(404);
    });
  });

  describe("framework links outlive the use cases using the framework", () => {
    it("saves a model whose framework no use case uses any more, and still refuses adding one", async () => {
      const user = await createTestProject(orgA, adminA, {});
      const pf = await createTestProjectFramework(orgA, user, 1);
      const api = await as(orgA, adminA, "Admin");
      const created = await api.post("/api/modelInventory").send(modelBody({ frameworks: [1] }));
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      // The last use case using framework 1 drops it.
      await sequelize.query(`DELETE FROM projects_frameworks WHERE id = :pf`, {
        replacements: { pf },
      });

      // The form sends every current framework back on each save.
      const saved = await api
        .patch(`/api/modelInventory/${id}`)
        .send(modelBody({ frameworks: [1], version: "2" }));
      expect(saved.status).toBe(200);
      expect(saved.body.data.frameworks).toEqual([1]);

      const added = await api
        .patch(`/api/modelInventory/${id}`)
        .send(modelBody({ frameworks: [1, 2] }));
      expect(added.status).toBe(400);
    });
  });
});
