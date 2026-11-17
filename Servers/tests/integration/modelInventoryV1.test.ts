jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestModelInventory, createTestProject } from "../factories/test-entities.factory";

/**
 * /api/v1/model-inventory (audit M-M4, decision 8): the model list of a use
 * case, and linking a model to a use case, need access to that use case. The
 * legacy routes are unchanged.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
const userIn = (orgId: number, role: RoleName) => {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `miv1-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
};
const as = async (orgId: number, userId: number, role: RoleName) =>
  testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );

const modelBody = (extra: Record<string, unknown> = {}) => ({
  provider: "Acme",
  model: `V1 model ${Date.now()}-${++counter}`,
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

describe("/api/v1/model-inventory", () => {
  let orgA: number;
  let orgB: number;
  let adminA: number;
  let editorA: number;
  let auditorA: number;
  let adminB: number;
  let hidden: number; // the Editor is not a member
  let own: number; // the Editor owns it
  let model: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgA = await createTestOrganization("V1 A");
    orgB = await createTestOrganization("V1 B");
    adminA = await userIn(orgA, "Admin");
    editorA = await userIn(orgA, "Editor");
    auditorA = await userIn(orgA, "Auditor");
    adminB = await userIn(orgB, "Admin");
    hidden = await createTestProject(orgA, adminA, {});
    own = await createTestProject(orgA, editorA, {});
    model = await createTestModelInventory(orgA, {});
    await sequelize.query(
      `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
       VALUES (:orgA, :model, :hidden)`,
      { replacements: { orgA, model, hidden } },
    );
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  describe("GET /by-project/:projectId", () => {
    it("refuses a use case the caller cannot open; legacy still answers (frozen)", async () => {
      const api = await as(orgA, editorA, "Editor");
      expect((await api.get(`/api/v1/model-inventory/by-project/${hidden}`)).status).toBe(403);
      const legacy = await api.get(`/api/modelInventory/by-projectId/${hidden}`);
      expect(legacy.status).toBe(200);
    });

    it("lists the use case's models for an Admin", async () => {
      const res = await (
        await as(orgA, adminA, "Admin")
      ).get(`/api/v1/model-inventory/by-project/${hidden}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((m: any) => m.id)).toEqual([model]);
    });

    it("never shows another organization's use case", async () => {
      const res = await (
        await as(orgB, adminB, "Admin")
      ).get(`/api/v1/model-inventory/by-project/${hidden}`);
      expect((res.body.data ?? []).map((m: any) => m.id)).not.toContain(model);
    });
  });

  describe("POST /", () => {
    it("refuses an Editor linking a use case they cannot open, and writes nothing", async () => {
      const name = `Refused ${Date.now()}`;
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .post("/api/v1/model-inventory")
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
        .post("/api/v1/model-inventory")
        .send(modelBody({ projects: [own] }));
      expect(res.status).toBe(201);
      expect(await directLinks(res.body.data.id)).toEqual([own]);
    });

    it("refuses an Auditor, and another organization's use case", async () => {
      expect(
        (
          await (
            await as(orgA, auditorA, "Auditor")
          )
            .post("/api/v1/model-inventory")
            .send(modelBody())
        ).status,
      ).toBe(403);
      const other = await createTestProject(orgB, adminB, {});
      expect(
        (
          await (
            await as(orgA, adminA, "Admin")
          )
            .post("/api/v1/model-inventory")
            .send(modelBody({ projects: [other] }))
        ).status,
      ).toBe(400);
    });
  });

  describe("PATCH /:id", () => {
    it("refuses an Editor removing a link to a use case they cannot open", async () => {
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .patch(`/api/v1/model-inventory/${model}`)
        .send(modelBody({ projects: [own] }));
      expect(res.status).toBe(403);
      expect(await directLinks(model)).toEqual([hidden]);
    });

    it("lets an Editor add their own use case while keeping the hidden one", async () => {
      const res = await (
        await as(orgA, editorA, "Editor")
      )
        .patch(`/api/v1/model-inventory/${model}`)
        .send(modelBody({ projects: [hidden, own] }));
      expect(res.status).toBe(200);
      expect(await directLinks(model)).toEqual([hidden, own].sort((a, b) => a - b));
    });

    it("gives another organization's Admin a 404", async () => {
      const res = await (
        await as(orgB, adminB, "Admin")
      )
        .patch(`/api/v1/model-inventory/${model}`)
        .send(modelBody());
      expect(res.status).toBe(404);
    });
  });
});
