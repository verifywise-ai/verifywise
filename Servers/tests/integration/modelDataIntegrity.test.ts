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
  createTestRisk,
} from "../factories/test-entities.factory";
import { ReportDataCollector } from "../../services/reporting/dataCollector";
import { modelDeploymentWorkflow } from "../../services/workflows/definitions/modelDeployment.workflow";
import { deleteMockData } from "../../infrastructure.layer/driver/autoDriver.driver";
import { getStaleEvidenceRiskIdsQuery } from "../../utils/evidenceHub.utils";
import { getEntityChangeHistory } from "../../utils/changeHistory.base.utils";

/**
 * Use cases and models audit, PR F: deleting a model never deletes its risks
 * (Keep leaves them with no model, Delete archives them with history),
 * archived model risks stay out of reports and the deployment workflow and
 * cannot be edited, evidence forgets deleted models, and seeded demo models
 * go with "Delete demo data".
 */

const migration = require("../../database/migrations/20261117160827-model-risks-keep-on-model-delete.js");
const queryInterface = { sequelize };

let counter = 0;
const as = async (orgId: number, userId: number) =>
  testRequest(
    await createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    }),
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

const riskRow = async (id: number) =>
  (
    await sequelize.query<{ model_id: number | null; is_deleted: boolean; risk_name: string }>(
      `SELECT model_id, is_deleted, risk_name FROM model_risks WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )
  )[0];

const historyOf = (id: number) =>
  sequelize.query<{ action: string; field_name: string; old_value: string; new_value: string }>(
    `SELECT action, field_name, old_value, new_value FROM model_risk_change_history
      WHERE model_risk_id = :id ORDER BY id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );

const linkTo = async (orgId: number, child: number, modelRisk: number) =>
  (
    await sequelize.query<{ id: number }>(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'confirmed', 'user') RETURNING id`,
      { replacements: { orgId, child, modelRisk }, type: QueryTypes.SELECT },
    )
  )[0].id;

const linkExists = async (id: number) =>
  (
    await sequelize.query(`SELECT 1 FROM risk_links WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    })
  ).length === 1;

/**
 * Waits until another session is blocked on a lock while running a statement
 * that matches `pattern` (ILIKE), and fails if none does within ~5 s. Only
 * then may the test release the lock it holds: a wait anywhere else (or none,
 * if the statement does not lock) must not count.
 */
const waitForLockWait = async (pattern: string) => {
  for (let i = 0; i < 100; i++) {
    const [row] = await sequelize.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND query ILIKE :pattern`,
      { replacements: { pattern }, type: QueryTypes.SELECT },
    );
    if (row.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`no session waited on a lock running ${pattern}`);
};
const MODEL_ROW_LOCK = "%FROM model_inventories%FOR UPDATE%";

const archive = (id: number) =>
  sequelize.query(`UPDATE model_risks SET is_deleted = true, deleted_at = NOW() WHERE id = :id`, {
    replacements: { id },
  });

describe("model data integrity", () => {
  let org: number;
  let otherOrg: number;
  let admin: number;
  let project: number;

  beforeAll(async () => {
    await cleanupDatabase();
    await seedFrameworks();
    org = await createTestOrganization("Integrity org");
    otherOrg = await createTestOrganization("Other integrity org");
    admin = await createTestUser(org, 1, `mdi-admin-${Date.now()}@test.com`, "Pw123456!");
    project = await createTestProject(org, admin, {});
    await createTestProjectFramework(org, project, 1);
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  describe("deleting a model (M-H1)", () => {
    it("Keep risks: the risks stay with no model, their links survive, history says so", async () => {
      const api = await as(org, admin);
      const model = await createTestModelInventory(org, { provider: "Acme", model: "Keep model" });
      const live = await createTestModelRisk(org, { model_id: model });
      const archived = await createTestModelRisk(org, { model_id: model });
      await archive(archived);
      const useCaseRisk = await createTestRisk(org, {});
      const link = await linkTo(org, useCaseRisk, live);

      const res = await api.delete(`/api/modelInventory/${model}`);
      expect(res.status).toBe(200);

      expect(await riskRow(live)).toMatchObject({ model_id: null, is_deleted: false });
      expect(await riskRow(archived)).toMatchObject({ model_id: null, is_deleted: true });
      expect(await linkExists(link)).toBe(true);
      const lostModel = {
        action: "updated",
        field_name: "Associated model",
        old_value: "Acme Keep model",
        new_value: "-",
      };
      expect(await historyOf(live)).toEqual([lostModel]);
      // A risk archived earlier loses the model too, and its history says so.
      expect(await historyOf(archived)).toEqual([lostModel]);

      // The list shows it, with no model.
      const list = await api.get(`/api/modelRisks`);
      const row = list.body.data.find((r: any) => r.id === live);
      expect(row).toMatchObject({ model_id: null });
    });

    it("Delete risks too: the risks are archived with history, not removed", async () => {
      const api = await as(org, admin);
      const model = await createTestModelInventory(org, {
        provider: "Acme",
        model: "Delete model",
      });
      const a = await createTestModelRisk(org, { model_id: model });
      const b = await createTestModelRisk(org, { model_id: model });
      const useCaseRisk = await createTestRisk(org, {});
      const link = await linkTo(org, useCaseRisk, a);

      const res = await api.delete(`/api/modelInventory/${model}?deleteRisks=true`);
      expect(res.status).toBe(200);

      for (const id of [a, b]) {
        expect(await riskRow(id)).toMatchObject({ is_deleted: true, model_id: null });
        expect(await historyOf(id)).toEqual([
          {
            action: "deleted",
            field_name: "Model Risk",
            old_value: "Active",
            new_value: "Deleted",
          },
          // Which model the archived risk belonged to.
          {
            action: "updated",
            field_name: "Associated model",
            old_value: "Acme Delete model",
            new_value: "-",
          },
        ]);
      }
      // The archived risk row is still there, so its link row is too.
      expect(await linkExists(link)).toBe(true);
      const deleted = await api.get(`/api/modelRisks?filter=deleted`);
      expect(deleted.body.data.map((r: any) => r.id)).toEqual(expect.arrayContaining([a, b]));
    });

    it("Delete risks too: a risk added while the delete runs is archived, not kept", async () => {
      const api = await as(org, admin);
      const model = await createTestModelInventory(org, {});
      const existing = await createTestModelRisk(org, { model_id: model });

      // Another request adds a risk to the model and has not committed yet.
      const other = await sequelize.transaction();
      let late: number;
      let pending: Promise<any> | undefined;
      try {
        late = (
          await sequelize.query<{ id: number }>(
            `INSERT INTO model_risks (organization_id, model_id, risk_name, risk_level, created_at, updated_at, is_deleted)
             VALUES (:org, :model, 'Late risk', 'Low', NOW(), NOW(), false) RETURNING id`,
            { replacements: { org, model }, type: QueryTypes.SELECT, transaction: other },
          )
        )[0].id;

        pending = api.delete(`/api/modelInventory/${model}?deleteRisks=true`).then((r) => r);
        // The delete must be blocked on its own model row lock (the insert's
        // foreign key holds a key-share lock on the row) before the insert
        // commits; no other wait counts.
        await waitForLockWait(MODEL_ROW_LOCK);
        await other.commit();
      } catch (error) {
        await other.rollback();
        throw error;
      }

      expect((await pending!).status).toBe(200);
      for (const id of [existing, late]) {
        expect(await riskRow(id)).toMatchObject({ is_deleted: true, model_id: null });
      }
    });

    it("a validation added while the delete waits still answers 409, model kept", async () => {
      const api = await as(org, admin);
      const model = await createTestModelInventory(org, {});

      // Another request starts a validation of the model, not committed yet.
      const other = await sequelize.transaction();
      let pending: Promise<any> | undefined;
      try {
        await sequelize.query(
          `INSERT INTO mrm_validations (organization_id, model_inventory_id) VALUES (:org, :model)`,
          { replacements: { org, model }, transaction: other },
        );
        pending = api.delete(`/api/modelInventory/${model}`).then((r) => r);
        await waitForLockWait(MODEL_ROW_LOCK);
        await other.commit();
      } catch (error) {
        await other.rollback();
        throw error;
      }

      expect((await pending!).status).toBe(409);
      const left = await sequelize.query(`SELECT 1 FROM model_inventories WHERE id = :model`, {
        replacements: { model },
        type: QueryTypes.SELECT,
      });
      expect(left).toHaveLength(1);
    });

    it("never touches another organization's risks", async () => {
      const api = await as(org, admin);
      const model = await createTestModelInventory(org, {});
      const foreignModel = await createTestModelInventory(otherOrg, {});
      const foreignRisk = await createTestModelRisk(otherOrg, { model_id: foreignModel });

      expect((await api.delete(`/api/modelInventory/${model}?deleteRisks=true`)).status).toBe(200);
      expect((await api.delete(`/api/modelInventory/${foreignModel}`)).status).toBe(404);
      expect(await riskRow(foreignRisk)).toMatchObject({
        model_id: foreignModel,
        is_deleted: false,
      });
    });
  });

  describe("the foreign key migration", () => {
    // These tests change the shared schema: put the new key back whatever
    // happens (up is idempotent), so a failure cannot leave CASCADE behind.
    afterEach(async () => {
      await migration.up(queryInterface);
    });

    const fkDef = async () =>
      (
        await sequelize.query<{ def: string }>(
          `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
            WHERE conrelid = 'verifywise.model_risks'::regclass AND conname = 'model_risks_model_id_fkey'`,
          { type: QueryTypes.SELECT },
        )
      ).map((r) => r.def);

    it("down restores CASCADE, up sets NULL again, on a table with data", async () => {
      const model = await createTestModelInventory(org, {});
      const risk = await createTestModelRisk(org, { model_id: model });

      await migration.down(queryInterface);
      expect(await fkDef()).toEqual([
        expect.stringMatching(
          /REFERENCES (verifywise\.)?model_inventories\(id\) ON DELETE CASCADE/,
        ),
      ]);
      await migration.up(queryInterface);
      expect(await fkDef()).toEqual([
        expect.stringMatching(
          /REFERENCES (verifywise\.)?model_inventories\(id\) ON DELETE SET NULL/,
        ),
      ]);
      expect(await riskRow(risk)).toMatchObject({ model_id: model, is_deleted: false });

      // A delete outside the app (e.g. demo data) leaves the risk too.
      await sequelize.query(`DELETE FROM model_inventories WHERE id = :model`, {
        replacements: { model },
      });
      expect(await riskRow(risk)).toMatchObject({ model_id: null, is_deleted: false });
    });

    it("up replaces a key created under another name", async () => {
      await sequelize.query(
        `ALTER TABLE verifywise.model_risks DROP CONSTRAINT model_risks_model_id_fkey;
         ALTER TABLE verifywise.model_risks ADD CONSTRAINT legacy_model_fk
           FOREIGN KEY (model_id) REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE;`,
      );
      await migration.up(queryInterface);
      const names = await sequelize.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conrelid = 'verifywise.model_risks'::regclass
            AND confrelid = 'verifywise.model_inventories'::regclass`,
        { type: QueryTypes.SELECT },
      );
      expect(names.map((n) => n.conname)).toEqual(["model_risks_model_id_fkey"]);
    });
  });

  describe("model risk history names the model", () => {
    it("an edit of the model records model names, like a model delete does", async () => {
      const api = await as(org, admin);
      const from = await createTestModelInventory(org, { provider: "Acme", model: "From model" });
      const to = await createTestModelInventory(org, { provider: "Acme", model: "To model" });
      const risk = await createTestModelRisk(org, { model_id: from });

      const res = await api.patch(`/api/modelRisks/${risk}`).send({ model_id: to });
      expect(res.status).toBe(200);
      expect(await historyOf(risk)).toEqual([
        {
          action: "updated",
          field_name: "Associated model",
          old_value: "Acme From model",
          new_value: "Acme To model",
        },
      ]);
    });

    it("a move between two models with the same name is still recorded", async () => {
      const api = await as(org, admin);
      const from = await createTestModelInventory(org, { provider: "Acme", model: "Twin" });
      const to = await createTestModelInventory(org, { provider: "Acme", model: "Twin" });
      const risk = await createTestModelRisk(org, { model_id: from });

      expect((await api.patch(`/api/modelRisks/${risk}`).send({ model_id: to })).status).toBe(200);
      expect(await riskRow(risk)).toMatchObject({ model_id: to });
      expect(await historyOf(risk)).toEqual([
        {
          action: "updated",
          field_name: "Associated model",
          old_value: "Acme Twin",
          new_value: "Acme Twin",
        },
      ]);
      // Sending the same model again is not a change, whatever its type.
      expect(
        (await api.patch(`/api/modelRisks/${risk}`).send({ model_id: String(to) })).status,
      ).toBe(200);
      expect(await historyOf(risk)).toHaveLength(1);
    });

    it("lists entries written in one transaction newest first", async () => {
      // One transaction writes its entries with the same changed_at (deleting
      // a model with its risks records the deletion and the lost model): the
      // list breaks the tie by id, newest first.
      const risk = await createTestModelRisk(org, {});
      const inserted = await sequelize.query<{ id: number }>(
        `INSERT INTO model_risk_change_history
           (organization_id, model_risk_id, field_name, old_value, new_value, action, changed_by_user_id, changed_at)
         SELECT :org, :risk, 'Risk name', 'v' || g, 'v' || (g + 1), 'updated', :admin, TIMESTAMP '2026-01-01 12:00:00'
           FROM generate_series(1, 12) g
         RETURNING id`,
        { replacements: { org, risk, admin }, type: QueryTypes.SELECT },
      );
      const newestFirst = inserted.map((row) => row.id).sort((a, b) => b - a);
      // Rewrite the older half under the same ids, so storage order no longer
      // follows id order and only the id tie-break gives newest first.
      const older = newestFirst.slice(6);
      await sequelize.query(
        `WITH gone AS (DELETE FROM model_risk_change_history WHERE id IN (:older) RETURNING *)
         INSERT INTO model_risk_change_history SELECT * FROM gone`,
        { replacements: { older } },
      );

      const { data } = await getEntityChangeHistory("model_risk", risk, org);
      expect(data.map((row: any) => row.id)).toEqual(newestFirst);
      const page = await getEntityChangeHistory("model_risk", risk, org, 5, 5);
      expect(page.data.map((row: any) => row.id)).toEqual(newestFirst.slice(5, 10));
    });

    it("diffs against the row as the update locked it, not as it was before", async () => {
      const api = await as(org, admin);
      const risk = await createTestModelRisk(org, { risk_name: "A" });

      // Another request renames the risk and has not committed yet.
      const other = await sequelize.transaction();
      let pending: Promise<any> | undefined;
      try {
        await sequelize.query(`UPDATE model_risks SET risk_name = 'B' WHERE id = :risk`, {
          replacements: { risk },
          transaction: other,
        });
        pending = api
          .patch(`/api/modelRisks/${risk}`)
          .send({ risk_name: "C" })
          .then((r) => r);
        await waitForLockWait("%model_risks%");
        await other.commit();
      } catch (error) {
        await other.rollback();
        throw error;
      }

      expect((await pending!).status).toBe(200);
      expect(await historyOf(risk)).toEqual([
        { action: "updated", field_name: "Risk name", old_value: "B", new_value: "C" },
      ]);
    });
  });

  describe("a deleted model risk (M-M9)", () => {
    it("answers 404 on update and delete, and records nothing", async () => {
      const api = await as(org, admin);
      const risk = await createTestModelRisk(org, { risk_name: "Before" });
      await archive(risk);

      const put = await api.put(`/api/modelRisks/${risk}`).send({ risk_name: "After" });
      expect(put.status).toBe(404);
      const patch = await api.patch(`/api/modelRisks/${risk}`).send({ risk_name: "After" });
      expect(patch.status).toBe(404);
      const del = await api.delete(`/api/modelRisks/${risk}`);
      expect(del.status).toBe(404);

      expect(await riskRow(risk)).toMatchObject({ risk_name: "Before", is_deleted: true });
      expect(await historyOf(risk)).toEqual([]);
    });

    it("a live one still updates and deletes", async () => {
      const api = await as(org, admin);
      const risk = await createTestModelRisk(org, {});
      expect((await api.patch(`/api/modelRisks/${risk}`).send({ risk_name: "New" })).status).toBe(
        200,
      );
      expect((await api.delete(`/api/modelRisks/${risk}`)).status).toBe(200);
      expect((await api.delete(`/api/modelRisks/${risk}`)).status).toBe(404);
      expect(await riskRow(risk)).toMatchObject({ is_deleted: true });
    });

    it("an unknown or foreign one is a 404 on delete", async () => {
      const api = await as(org, admin);
      const foreign = await createTestModelRisk(otherOrg, {});
      expect((await api.delete(`/api/modelRisks/${foreign}`)).status).toBe(404);
      expect((await api.delete(`/api/modelRisks/99999999`)).status).toBe(404);
      expect(await riskRow(foreign)).toMatchObject({ is_deleted: false });
    });
  });

  describe("reports (M-H5)", () => {
    it("leave archived model risks out, and list kept ones with no model", async () => {
      const model = await createTestModelInventory(org, { model: "Report model" });
      await sequelize.query(
        `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
         VALUES (:org, :model, :project)`,
        { replacements: { org, model, project } },
      );
      const open = await createTestModelRisk(org, { model_id: model, risk_name: "Open one" });
      const gone = await createTestModelRisk(org, { model_id: model, risk_name: "Archived one" });
      await archive(gone);
      const orphan = await createTestModelRisk(org, { risk_name: "Orphan one" });

      const collector = new ReportDataCollector(org, project, 0, 0, admin, "organization") as any;
      const orgWide = await collector.collectModelRisks(true);
      const orgIds = orgWide.risks.map((r: any) => r.id);
      expect(orgIds).toEqual(expect.arrayContaining([open, orphan]));
      expect(orgIds).not.toContain(gone);
      expect(orgWide.risks.find((r: any) => r.id === orphan).modelName).toBe("No model");
      expect(orgWide.risks.find((r: any) => r.id === open).modelName).toBe("Report model");

      const useCase = await (
        new ReportDataCollector(org, project, 0, 0, admin, "project") as any
      ).collectModelRisks(false);
      expect(useCase.risks.map((r: any) => r.id)).toEqual([open]);
    });
  });

  describe("deployment workflow risk snapshot (M-M6)", () => {
    it("runs, and counts live High and Critical risks", async () => {
      const model = await createTestModelInventory(org, {});
      await createTestModelRisk(org, { model_id: model, risk_level: "Critical" });
      await createTestModelRisk(org, { model_id: model, risk_level: "High" });
      await createTestModelRisk(org, { model_id: model, risk_level: "Low" });
      const gone = await createTestModelRisk(org, { model_id: model, risk_level: "Critical" });
      await archive(gone);

      const step = modelDeploymentWorkflow.steps.find((s) => s.id === "risk_assessment")!;
      const result = await step.handler({
        workflowRunId: 1,
        organizationId: org,
        userId: admin,
        triggerPayload: { modelId: model },
        results: {},
      });
      expect(result).toEqual({ type: "ok", output: { count: 3, criticalCount: 2 } });
    });
  });

  describe("evidence (M-L5)", () => {
    it("drops a deleted model from evidence links, in its organization only", async () => {
      const api = await as(org, admin);
      const model = await createTestModelInventory(org, {});
      const kept = await createTestModelInventory(org, {});
      const [ev] = await sequelize.query<{ id: number }>(
        `INSERT INTO evidence_hub (organization_id, evidence_name, evidence_type, mapped_model_ids)
         VALUES (:org, 'Ev', 'Doc', ARRAY[:model, :kept]::int[]) RETURNING id`,
        { replacements: { org, model, kept }, type: QueryTypes.SELECT },
      );
      // Same id in another organization's evidence (bad data): left alone.
      const [foreignEv] = await sequelize.query<{ id: number }>(
        `INSERT INTO evidence_hub (organization_id, evidence_name, evidence_type, mapped_model_ids)
         VALUES (:otherOrg, 'Ev', 'Doc', ARRAY[:model]::int[]) RETURNING id`,
        { replacements: { otherOrg, model }, type: QueryTypes.SELECT },
      );

      expect((await api.delete(`/api/modelInventory/${model}`)).status).toBe(200);

      const ids = async (id: number) =>
        (
          await sequelize.query<{ mapped_model_ids: number[] }>(
            `SELECT mapped_model_ids FROM evidence_hub WHERE id = :id`,
            { replacements: { id }, type: QueryTypes.SELECT },
          )
        )[0].mapped_model_ids;
      expect(await ids(ev.id)).toEqual([kept]);
      expect(await ids(foreignEv.id)).toEqual([model]);
    });

    it("stale evidence stays stale when a model it lists is deleted", async () => {
      const api = await as(org, admin);
      const model = await createTestModelInventory(org, {});
      const risk = await createTestRisk(org, {});
      const [ev] = await sequelize.query<{ id: number }>(
        `INSERT INTO evidence_hub (organization_id, evidence_name, evidence_type, mapped_model_ids, mapped_risk_ids, updated_at)
         VALUES (:org, 'Old ev', 'Doc', ARRAY[:model]::int[], ARRAY[:risk]::int[], NOW() - INTERVAL '400 days')
         RETURNING id`,
        { replacements: { org, model, risk }, type: QueryTypes.SELECT },
      );
      expect(await getStaleEvidenceRiskIdsQuery(org, new Date())).toContain(risk);

      expect((await api.delete(`/api/modelInventory/${model}`)).status).toBe(200);

      const [row] = await sequelize.query<{ mapped_model_ids: number[]; old: boolean }>(
        `SELECT mapped_model_ids, updated_at < NOW() - INTERVAL '300 days' AS old
           FROM evidence_hub WHERE id = :id`,
        { replacements: { id: ev.id }, type: QueryTypes.SELECT },
      );
      expect(row).toEqual({ mapped_model_ids: [], old: true });
      expect(await getStaleEvidenceRiskIdsQuery(org, new Date())).toContain(risk);
    });
  });

  describe("model links on update (M-M3)", () => {
    it("a body with only frameworks keeps the use cases; one with neither keeps both", async () => {
      const api = await as(org, admin);
      const created = await api
        .post("/api/modelInventory")
        .send(modelBody({ projects: [project], frameworks: [1] }));
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const onlyFrameworks = await api
        .patch(`/api/modelInventory/${id}`)
        .send(modelBody({ frameworks: [1] }));
      expect(onlyFrameworks.status).toBe(200);
      expect(onlyFrameworks.body.data.projects).toEqual([project]);
      expect(onlyFrameworks.body.data.frameworks).toEqual([1]);

      const neither = await api.patch(`/api/modelInventory/${id}`).send(modelBody());
      expect(neither.status).toBe(200);
      expect(neither.body.data.projects).toEqual([project]);
      expect(neither.body.data.frameworks).toEqual([1]);
    });
  });

  describe("demo data (M-L7)", () => {
    it("a model created as demo data goes with Delete demo data; its risks stay", async () => {
      // Only the demo seed creates demo models (no route takes is_demo from a
      // body since PR G), so the demo row is written directly.
      const id = await createTestModelInventory(org, { model: "Demo model" });
      await sequelize.query(`UPDATE model_inventories SET is_demo = true WHERE id = :id`, {
        replacements: { id },
      });
      const realModel = await createTestModelInventory(org, {});
      const userRisk = await createTestModelRisk(org, { model_id: id });

      await deleteMockData(org);

      const left = await sequelize.query<{ id: number }>(
        `SELECT id FROM model_inventories WHERE id IN (:ids)`,
        { replacements: { ids: [id, realModel] }, type: QueryTypes.SELECT },
      );
      expect(left.map((r) => r.id)).toEqual([realModel]);
      // A non-demo risk on a demo model was deleted by the CASCADE before.
      expect(await riskRow(userRisk)).toMatchObject({ model_id: null, is_deleted: false });
    });
  });
});
