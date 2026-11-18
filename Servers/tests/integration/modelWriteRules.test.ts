jest.setTimeout(60000);

jest.mock("../../services/notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("../../services/workflows/triggers", () => ({
  ...jest.requireActual("../../services/workflows/triggers"),
  triggerModelDeployment: jest.fn().mockResolvedValue(undefined),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestModelInventory } from "../factories/test-entities.factory";
import { triggerModelDeployment } from "../../services/workflows/triggers";
import { notifyUserAssigned } from "../../services/inAppNotification.service";

/**
 * Use cases and models audit, PR G: model write rules. Strict v1
 * validation (M-M7, M-M10), legacy bad values answer 400 not 500, is_demo
 * never comes from the body, missing and malformed ids (M-L1), the model
 * approval rule (decision 9), model risk owner notices (decision 12), Shadow
 * AI's start governance through the model service and the deployment step
 * for a model created as Approved (M-M5).
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;
const deployTrigger = triggerModelDeployment as unknown as jest.Mock;

let counter = 0;
const userIn = (orgId: number, role: RoleName) =>
  createTestUser(orgId, ROLE[role], `mwr-${role}-${Date.now()}-${++counter}@test.com`, "Pw123456!");
const as = async (orgId: number, userId: number, role: RoleName) =>
  testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );

const modelBody = (extra: Record<string, unknown> = {}) => ({
  provider: "Acme",
  model: `Model ${Date.now()}-${++counter}`,
  version: "1",
  status: "Pending",
  status_date: new Date().toISOString(),
  ...extra,
});

const modelRow = async (id: number) =>
  (
    await sequelize.query<{ status: string; approver: number | null; is_demo: boolean }>(
      `SELECT status, approver, is_demo FROM model_inventories WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )
  )[0];

// tests/integration/setup stubs the notifier module, so the notices are read
// from the stub's calls; the member check inside it has its own tests.
const assigned = notifyUserAssigned as unknown as jest.Mock;
const ownerNotices = (userId: number, riskId: number) =>
  assigned.mock.calls.filter(
    ([, assignee, assignment]) =>
      assignee === userId &&
      assignment.roleType === "Risk Owner" &&
      assignment.entityType === "model_risk" &&
      assignment.entityUrl === `/model-inventory/model-risks?modelRiskId=${riskId}`,
  );

/** Notices are sent after commit, without being awaited: poll briefly. */
const waitForNotices = async (userId: number, riskId: number, count: number) => {
  for (let i = 0; i < 100; i++) {
    if (ownerNotices(userId, riskId).length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

describe("model write rules", () => {
  let org: number;
  let otherOrg: number;
  let admin: number;
  let editor: number;
  let approver: number;
  let auditor: number;
  let owner: number;
  let secondOwner: number;

  beforeAll(async () => {
    await cleanupDatabase();
    org = await createTestOrganization("Write rules org");
    otherOrg = await createTestOrganization("Other write rules org");
    admin = await userIn(org, "Admin");
    editor = await userIn(org, "Editor");
    approver = await userIn(org, "Editor");
    auditor = await userIn(org, "Auditor");
    owner = await userIn(org, "Editor");
    secondOwner = await userIn(org, "Editor");
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  beforeEach(() => {
    deployTrigger.mockClear();
  });

  describe("v1 validation (M-M7)", () => {
    it("refuses a model without its required fields, one message per field", async () => {
      const res = await (
        await as(org, admin, "Admin")
      )
        .post("/api/v1/model-inventories")
        .send({ provider: "Acme" });
      expect(res.status).toBe(400);
      const fields = res.body.data.errors.map((e: { field: string }) => e.field).sort();
      expect(fields).toEqual(["model", "version"]);
    });

    it("refuses a bad status, type, date and approver id with field messages", async () => {
      const res = await (
        await as(org, admin, "Admin")
      )
        .post("/api/v1/model-inventories")
        .send(modelBody({ status: "Bogus", type: "Neural", status_date: "soon", approver: "x" }));
      expect(res.status).toBe(400);
      const fields = res.body.data.errors.map((e: { field: string }) => e.field).sort();
      expect(fields).toEqual(["approver", "status", "status_date", "type"]);
    });

    it("creates a model from the form's body (approver '', type null, external key '')", async () => {
      const res = await (await as(org, admin, "Admin")).post("/api/v1/model-inventories").send(
        modelBody({
          approver: "",
          type: null,
          external_key: "",
          capabilities: ["Vision"],
          security_assessment: false,
          security_assessment_data: [],
          projects: [],
          frameworks: [],
        }),
      );
      expect(res.status).toBe(201);
    });

    it("refuses a model risk without its required fields", async () => {
      const res = await (
        await as(org, admin, "Admin")
      )
        .post("/api/v1/model-risks")
        .send({ risk_name: "Drift" });
      expect(res.status).toBe(400);
      const fields = res.body.data.errors.map((e: { field: string }) => e.field).sort();
      expect(fields).toEqual(["owner", "risk_category", "risk_level", "target_date"]);
    });

    it("creates a model risk from only its required fields, the rest null or empty", async () => {
      const res = await (await as(org, admin, "Admin")).post("/api/v1/model-risks").send({
        risk_name: "Drift",
        risk_category: "Performance",
        risk_level: "High",
        owner: String(owner),
        target_date: "2027-01-31",
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ model_id: null, status: "Open" });
    });

    it("refuses a request without a token, 403 for an Auditor, 404 across organizations", async () => {
      // The house auth middleware answers a missing token with 400 "Token not found".
      const anonymous = testRequest(await createTestApp());
      expect((await anonymous.post("/api/v1/model-inventories").send(modelBody())).status).toBe(
        400,
      );
      expect(
        (
          await (
            await as(org, auditor, "Auditor")
          )
            .post("/api/v1/model-inventories")
            .send(modelBody())
        ).status,
      ).toBe(403);
      const foreign = await createTestModelInventory(otherOrg, { provider: "X", model: "Foreign" });
      expect(
        (
          await (await as(org, admin, "Admin")).patch(`/api/v1/model-inventories/${foreign}`).send({
            version: "2",
          })
        ).status,
      ).toBe(404);
    });
  });

  describe("legacy routes", () => {
    it("answers a bad status with 400, not 500 (create and update)", async () => {
      const api = await as(org, admin, "Admin");
      expect(
        (await api.post("/api/modelInventory").send(modelBody({ status: "Bogus" }))).status,
      ).toBe(400);
      const id = (await api.post("/api/modelInventory").send(modelBody())).body.data.id;
      expect((await api.patch(`/api/modelInventory/${id}`).send({ status: "" })).status).toBe(400);
      expect(
        (await api.patch(`/api/modelInventory/${id}`).send({ status_date: "not a date" })).status,
      ).toBe(400);
    });

    it("still accepts a model with only provider and name (M-M7 leaves legacy as is)", async () => {
      const res = await (
        await as(org, admin, "Admin")
      )
        .post("/api/modelInventory")
        .send({ provider: "Acme", model: `Bare ${++counter}` });
      expect(res.status).toBe(201);
    });

    it("creates a model risk with only a name (M-M10), unset fields null", async () => {
      const res = await (
        await as(org, admin, "Admin")
      )
        .post("/api/modelRisks")
        .send({ risk_name: "Bare risk" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        risk_category: null,
        risk_level: null,
        target_date: null,
        owner: null,
      });
    });
  });

  describe("malformed status and approver (fail closed)", () => {
    const modelCount = async () =>
      (
        await sequelize.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM model_inventories WHERE organization_id = :org`,
          { replacements: { org }, type: QueryTypes.SELECT },
        )
      )[0].n;

    it.each([[["Approved"]], [{}], [1]])(
      "answers 400 for status %p on create and update, legacy and v1, and writes nothing",
      async (status) => {
        const api = await as(org, editor, "Editor");
        const before = await modelCount();
        expect((await api.post("/api/modelInventory").send(modelBody({ status }))).status).toBe(
          400,
        );
        expect(
          (await api.post("/api/v1/model-inventories").send(modelBody({ status }))).status,
        ).toBe(400);
        expect(await modelCount()).toBe(before);

        const id = (
          await (
            await as(org, admin, "Admin")
          )
            .post("/api/modelInventory")
            .send(modelBody({ approver }))
        ).body.data.id as number;
        expect((await api.patch(`/api/modelInventory/${id}`).send({ status })).status).toBe(400);
        expect((await api.patch(`/api/v1/model-inventories/${id}`).send({ status })).status).toBe(
          400,
        );
        expect((await modelRow(id)).status).toBe("Pending");
      },
    );

    it("answers 400 for an approver sent as an array", async () => {
      const api = await as(org, admin, "Admin");
      expect(
        (await api.post("/api/modelInventory").send(modelBody({ approver: [approver] }))).status,
      ).toBe(400);
    });
  });

  describe("approver ids (normalized once)", () => {
    it('treats "07"-style padding of the saved approver as unchanged (legacy)', async () => {
      const id = (
        await (
          await as(org, admin, "Admin")
        )
          .post("/api/modelInventory")
          .send(modelBody({ approver, status: "Approved" }))
      ).body.data.id as number;
      const res = await (
        await as(org, editor, "Editor")
      )
        .patch(`/api/modelInventory/${id}`)
        .send({ approver: `0${approver}`, status: "Approved", version: "9" });
      expect(res.status).toBe(200);
      expect((await modelRow(id)).approver).toBe(approver);
    });

    it('keeps 0 and "0" meaning no approver on legacy, refuses them on v1', async () => {
      const api = await as(org, admin, "Admin");
      for (const none of [0, "0"]) {
        const created = await api.post("/api/modelInventory").send(modelBody({ approver: none }));
        expect(created.status).toBe(201);
        expect((await modelRow(created.body.data.id)).approver).toBeNull();
        expect(
          (await api.post("/api/v1/model-inventories").send(modelBody({ approver: none }))).status,
        ).toBe(400);
      }
    });

    it.each([["00"], ["-1"], ["1e3"], [2147483648]])(
      "answers 400 for approver %p on legacy and v1, and writes nothing",
      async (bad) => {
        const api = await as(org, admin, "Admin");
        expect(
          (await api.post("/api/modelInventory").send(modelBody({ approver: bad }))).status,
        ).toBe(400);
        expect(
          (await api.post("/api/v1/model-inventories").send(modelBody({ approver: bad }))).status,
        ).toBe(400);
        const id = (await api.post("/api/modelInventory").send(modelBody({ approver }))).body.data
          .id as number;
        expect((await api.patch(`/api/modelInventory/${id}`).send({ approver: bad })).status).toBe(
          400,
        );
        expect((await modelRow(id)).approver).toBe(approver);
      },
    );
  });

  describe("empty type and null external key", () => {
    const typeAndKey = async (id: number) =>
      (
        await sequelize.query<{ type: string | null; external_key: string | null }>(
          `SELECT type::text AS type, external_key FROM model_inventories WHERE id = :id`,
          { replacements: { id }, type: QueryTypes.SELECT },
        )
      )[0];

    it('stores type "" as unclassified on create and update, legacy and v1', async () => {
      const api = await as(org, admin, "Admin");
      for (const path of ["/api/modelInventory", "/api/v1/model-inventories"]) {
        const created = await api.post(path).send(modelBody({ type: "" }));
        expect(created.status).toBe(201);
        expect((await typeAndKey(created.body.data.id)).type).toBeNull();
        await api.patch(`${path}/${created.body.data.id}`).send({ type: "RAG" });
        const cleared = await api.patch(`${path}/${created.body.data.id}`).send({ type: "" });
        expect(cleared.status).toBe(200);
        expect((await typeAndKey(created.body.data.id)).type).toBeNull();
      }
    });

    it("clears the external key with null on v1 update (was a 500)", async () => {
      const api = await as(org, admin, "Admin");
      const id = (
        await api
          .post("/api/v1/model-inventories")
          .send(modelBody({ external_key: `key-${++counter}` }))
      ).body.data.id as number;
      const res = await api.patch(`/api/v1/model-inventories/${id}`).send({ external_key: null });
      expect(res.status).toBe(200);
      expect((await typeAndKey(id)).external_key).toBeNull();
    });
  });

  describe("is_demo never comes from the body", () => {
    it("ignores it on model create and update, legacy and v1", async () => {
      const api = await as(org, admin, "Admin");
      const legacy = (await api.post("/api/modelInventory").send(modelBody({ is_demo: true }))).body
        .data.id;
      const v1 = (await api.post("/api/v1/model-inventories").send(modelBody({ is_demo: true })))
        .body.data.id;
      expect((await modelRow(legacy)).is_demo).toBe(false);
      expect((await modelRow(v1)).is_demo).toBe(false);
      await api.patch(`/api/modelInventory/${legacy}`).send({ is_demo: true });
      expect((await modelRow(legacy)).is_demo).toBe(false);
    });

    it("ignores it on model risk create", async () => {
      const res = await (
        await as(org, admin, "Admin")
      )
        .post("/api/modelRisks")
        .send({ risk_name: "Demo?", is_demo: true });
      const [row] = await sequelize.query<{ is_demo: boolean }>(
        `SELECT is_demo FROM model_risks WHERE id = :id`,
        { replacements: { id: res.body.data.id }, type: QueryTypes.SELECT },
      );
      expect(row.is_demo).toBe(false);
    });
  });

  describe("ids (M-L1)", () => {
    it("answers 404 for a missing model and 400 for a malformed id", async () => {
      const api = await as(org, admin, "Admin");
      expect((await api.get("/api/modelInventory/999999")).status).toBe(404);
      expect((await api.get("/api/modelInventory/abc")).status).toBe(400);
      expect((await api.patch("/api/modelInventory/abc").send({ version: "2" })).status).toBe(400);
      expect((await api.delete("/api/modelInventory/abc")).status).toBe(400);
      expect((await api.delete("/api/modelInventory/999999")).status).toBe(404);
    });

    it("answers 400 for a malformed model risk id", async () => {
      const api = await as(org, admin, "Admin");
      expect((await api.get("/api/modelRisks/abc")).status).toBe(400);
      expect((await api.patch("/api/modelRisks/abc").send({ risk_name: "x" })).status).toBe(400);
      expect((await api.delete("/api/modelRisks/1x")).status).toBe(400);
      expect((await api.get("/api/modelRisks/999999")).status).toBe(404);
    });
  });

  describe("approval rule (decision 9)", () => {
    const pendingWithApprover = async () =>
      (
        await (
          await as(org, admin, "Admin")
        )
          .post("/api/modelInventory")
          .send(modelBody({ approver }))
      ).body.data.id as number;

    it("refuses an Editor who is not the approver setting Approved (403)", async () => {
      const id = await pendingWithApprover();
      const res = await (
        await as(org, editor, "Editor")
      )
        .patch(`/api/modelInventory/${id}`)
        .send({ status: "Approved" });
      expect(res.status).toBe(403);
      expect(res.body.data).toBe("Only the model's approver or an Admin can change its approval.");
      expect((await modelRow(id)).status).toBe("Pending");
    });

    it("refuses it on v1 too", async () => {
      const id = await pendingWithApprover();
      const res = await (
        await as(org, editor, "Editor")
      )
        .patch(`/api/v1/model-inventories/${id}`)
        .send({ status: "Blocked" });
      expect(res.status).toBe(403);
    });

    it("lets the named approver decide", async () => {
      const id = await pendingWithApprover();
      const res = await (
        await as(org, approver, "Editor")
      )
        .patch(`/api/modelInventory/${id}`)
        .send({ status: "Approved" });
      expect(res.status).toBe(200);
      expect((await modelRow(id)).status).toBe("Approved");
    });

    it("lets an Admin decide", async () => {
      const id = await pendingWithApprover();
      const res = await (
        await as(org, admin, "Admin")
      )
        .patch(`/api/modelInventory/${id}`)
        .send({ status: "Blocked" });
      expect(res.status).toBe(200);
    });

    it("accepts the stored status sent back by an Editor", async () => {
      const id = await pendingWithApprover();
      await (await as(org, approver, "Editor")).patch(`/api/modelInventory/${id}`).send({
        status: "Approved",
      });
      const res = await (
        await as(org, editor, "Editor")
      )
        .patch(`/api/modelInventory/${id}`)
        .send({ status: "Approved", approver, version: "2" });
      expect(res.status).toBe(200);
    });

    it("refuses a non-Admin who names themself approver and decides", async () => {
      const res = await (
        await as(org, editor, "Editor")
      )
        .post("/api/modelInventory")
        .send(modelBody({ approver: editor, status: "Approved" }));
      expect(res.status).toBe(403);
    });

    it("names an approver on an Approved model with none only while moving it to Pending", async () => {
      const id = (
        await (
          await as(org, admin, "Admin")
        )
          .post("/api/modelInventory")
          .send(modelBody({ status: "Approved" }))
      ).body.data.id as number;
      const api = await as(org, editor, "Editor");
      expect((await api.patch(`/api/modelInventory/${id}`).send({ approver })).status).toBe(403);
      expect((await modelRow(id)).approver).toBeNull();
      const res = await api
        .patch(`/api/modelInventory/${id}`)
        .send({ approver, status: "Pending" });
      expect(res.status).toBe(200);
      expect(await modelRow(id)).toMatchObject({ approver, status: "Pending" });

      const other = (
        await (
          await as(org, admin, "Admin")
        )
          .post("/api/modelInventory")
          .send(modelBody({ status: "Approved" }))
      ).body.data.id as number;
      expect(
        (
          await (
            await as(org, admin, "Admin")
          )
            .patch(`/api/modelInventory/${other}`)
            .send({ approver })
        ).status,
      ).toBe(200);
    });

    it("closes the two-step bypass: an Editor cannot clear the approver, then decide", async () => {
      const id = await pendingWithApprover();
      const api = await as(org, editor, "Editor");
      const clear = await api.patch(`/api/modelInventory/${id}`).send({ approver: null });
      expect(clear.status).toBe(403);
      expect(clear.body.data).toBe(
        "Only the model's approver or an Admin can change its approval.",
      );
      expect((await modelRow(id)).approver).toBe(approver);
      const decide = await api.patch(`/api/modelInventory/${id}`).send({ status: "Approved" });
      expect(decide.status).toBe(403);
      expect((await modelRow(id)).status).toBe("Pending");
    });
  });

  describe("deployment step (M-M5)", () => {
    it("runs for a model created as Approved", async () => {
      const res = await (
        await as(org, admin, "Admin")
      )
        .post("/api/modelInventory")
        .send(modelBody({ status: "Approved", version: "7" }));
      expect(res.status).toBe(201);
      await settle();
      expect(deployTrigger).toHaveBeenCalledWith(org, res.body.data.id, res.body.data.model, "7");
    });

    it("runs when a model moves to Approved, once", async () => {
      const api = await as(org, admin, "Admin");
      const id = (await api.post("/api/modelInventory").send(modelBody())).body.data.id;
      await settle();
      expect(deployTrigger).not.toHaveBeenCalled();
      await api.patch(`/api/modelInventory/${id}`).send({ status: "Approved" });
      await settle();
      expect(deployTrigger).toHaveBeenCalledTimes(1);
      await api.patch(`/api/modelInventory/${id}`).send({ status: "Approved", version: "3" });
      await settle();
      expect(deployTrigger).toHaveBeenCalledTimes(1);
    });
  });

  describe("model risk owner notices (decision 12)", () => {
    it("tells the owner of a new model risk, and a new owner on update only", async () => {
      const api = await as(org, admin, "Admin");
      const created = await api.post("/api/modelRisks").send({ risk_name: "Bias", owner });
      expect(created.status).toBe(201);
      const riskId = created.body.data.id as number;
      await waitForNotices(owner, riskId, 1);
      expect(ownerNotices(owner, riskId)).toHaveLength(1);

      // Unchanged owner: no new notice.
      await api.patch(`/api/modelRisks/${riskId}`).send({ owner, risk_name: "Bias 2" });
      await settle();
      expect(ownerNotices(owner, riskId)).toHaveLength(1);

      // A new owner is told.
      await api.patch(`/api/modelRisks/${riskId}`).send({ owner: secondOwner });
      await waitForNotices(secondOwner, riskId, 1);
      expect(ownerNotices(secondOwner, riskId)).toHaveLength(1);
    });
  });

  describe("Shadow AI start governance (M-M5)", () => {
    it("adds the model with a change history row and runs the deployment step for Approved", async () => {
      const [tool] = await sequelize.query<{ id: number }>(
        `INSERT INTO shadow_ai_tools (organization_id, name, domains, status)
         VALUES (:org, :name, ARRAY['tool.example.com'], 'detected') RETURNING id`,
        { replacements: { org, name: `Tool ${++counter}` }, type: QueryTypes.SELECT },
      );
      const res = await (
        await as(org, admin, "Admin")
      )
        .post(`/api/shadow-ai/tools/${tool.id}/start-governance`)
        .send({
          model_inventory: { provider: "OpenAI", model: "GPT-4o", status: "Approved" },
          governance_owner_id: owner,
          risk_assessment: { data_sensitivity: "High" },
        });
      expect(res.status).toBe(201);
      const modelId = res.body.data.model_inventory_id as number;
      const history = await sequelize.query<{ action: string }>(
        `SELECT action FROM model_inventory_change_history WHERE model_inventory_id = :modelId`,
        { replacements: { modelId }, type: QueryTypes.SELECT },
      );
      expect(history.length).toBeGreaterThan(0);
      await settle();
      expect(deployTrigger).toHaveBeenCalledWith(org, modelId, "GPT-4o", "N/A");
      if (res.body.data.risk_entry_id) {
        await waitForNotices(owner, res.body.data.risk_entry_id, 1);
        expect(ownerNotices(owner, res.body.data.risk_entry_id)).toHaveLength(1);
      }
    });
  });
});
