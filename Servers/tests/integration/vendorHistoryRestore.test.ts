jest.setTimeout(60000);

jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn().mockResolvedValue(undefined),
  enqueueVendorRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
  enqueueVendorRiskLinkRecomputeBatch: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  ...jest.requireActual("../../services/inAppNotification.service"),
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject, createTestVendor } from "../factories";
import { ReportDataCollector } from "../../services/reporting/dataCollector";

/**
 * Vendors audit PR C: deletion history for vendors and vendor risks, what a
 * vendor delete removes, reading and restoring a deleted vendor risk, the
 * history fields that were missing, and reports without deleted risks.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `vendor-history-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function as(orgId: number, userId: number, role: RoleName) {
  return testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
}

type HistoryRow = {
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by_user_id: number | null;
  changed_by_system: boolean | null;
};

async function history(table: "vendor" | "vendor_risk", id: number): Promise<HistoryRow[]> {
  const column = table === "vendor" ? "vendor_id" : "vendor_risk_id";
  return sequelize.query<HistoryRow>(
    `SELECT action, field_name, old_value, new_value, changed_by_user_id, changed_by_system
       FROM ${table}_change_history WHERE ${column} = :id ORDER BY id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
}

async function count(sql: string, replacements: Record<string, unknown>): Promise<number> {
  const [row] = await sequelize.query<{ n: string }>(`SELECT count(*) AS n FROM (${sql}) q`, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return Number(row.n);
}

async function insertId(sql: string, replacements: Record<string, unknown>): Promise<number> {
  const [row] = await sequelize.query<{ id: number }>(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return row.id;
}

const riskPayload = (vendorId: number, extra: Record<string, unknown> = {}) => ({
  vendor_id: vendorId,
  risk_description: "Subprocessor list is out of date",
  likelihood: "Possible",
  risk_severity: "Moderate",
  ...extra,
});

describe("vendor history, delete and restore", () => {
  let orgId: number;
  let adminId: number;
  let admin: ReturnType<typeof testRequest>;

  beforeEach(async () => {
    await seedFrameworks();
    orgId = await createTestOrganization();
    adminId = await userIn(orgId, "Admin");
    admin = await as(orgId, adminId, "Admin");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("deleting a vendor risk", () => {
    it("records the deletion and keeps the risk's custom field values", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const riskId = created.body.data.id;
      const definitionId = await insertId(
        `INSERT INTO custom_field_definitions (organization_id, entity_type, field_key, label, field_type)
         VALUES (:orgId, 'vendor_risk', 'ticket', 'Ticket', 'text') RETURNING id`,
        { orgId },
      );
      await sequelize.query(
        `INSERT INTO custom_field_values (organization_id, definition_id, entity_type, entity_id, value)
         VALUES (:orgId, :definitionId, 'vendor_risk', :riskId, '"VR-1"'::jsonb)`,
        { replacements: { orgId, definitionId, riskId } },
      );

      const res = await admin.delete(`/api/vendorRisks/${riskId}`);

      expect(res.status).toBe(202);
      const deleted = (await history("vendor_risk", riskId)).filter((h) => h.action === "deleted");
      expect(deleted).toEqual([
        expect.objectContaining({
          field_name: "Vendor Risk",
          old_value: "Active",
          new_value: "Deleted",
          changed_by_user_id: adminId,
        }),
      ]);
      expect(
        await count(
          `SELECT 1 FROM custom_field_values WHERE entity_type = 'vendor_risk' AND entity_id = :riskId`,
          { riskId },
        ),
      ).toBe(1);
    });

    it("opens a deleted risk read-only, with is_deleted set", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const riskId = created.body.data.id;
      await admin.delete(`/api/vendorRisks/${riskId}`);

      const res = await admin.get(`/api/v1/vendor-risks/${riskId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.is_deleted).toBe(true);
      // Still not editable, nor are its custom field values.
      const edit = await admin.patch(`/api/vendorRisks/${riskId}`).send({ action_plan: "x" });
      expect(edit.status).toBe(404);
      const definitionId = await insertId(
        `INSERT INTO custom_field_definitions (organization_id, entity_type, field_key, label, field_type)
         VALUES (:orgId, 'vendor_risk', 'ticket', 'Ticket', 'text') RETURNING id`,
        { orgId },
      );
      await sequelize.query(
        `INSERT INTO custom_field_values (organization_id, definition_id, entity_type, entity_id, value)
         VALUES (:orgId, :definitionId, 'vendor_risk', :riskId, '"VR-1"'::jsonb)`,
        { replacements: { orgId, definitionId, riskId } },
      );
      const write = await admin
        .put(`/api/custom-fields/values`)
        .send({ definition_id: definitionId, entity_id: riskId, value: "VR-2" });
      expect(write.status).toBeGreaterThanOrEqual(400);
      await admin.delete(`/api/custom-fields/values/${definitionId}/${riskId}`);
      const [value] = await sequelize.query<{ value: string }>(
        `SELECT value FROM custom_field_values WHERE entity_type = 'vendor_risk' AND entity_id = :riskId`,
        { replacements: { riskId }, type: QueryTypes.SELECT },
      );
      expect(value?.value).toBe("VR-1");
    });

    it("keeps the frozen legacy contract: no deleted risk, no restore route", async () => {
      const vendorId = await createTestVendor(orgId);
      const riskId = (await admin.post("/api/vendorRisks").send(riskPayload(vendorId))).body.data
        .id;
      await admin.delete(`/api/vendorRisks/${riskId}`);

      expect((await admin.get(`/api/vendorRisks/${riskId}`)).status).toBe(404);
      expect((await admin.patch(`/api/vendorRisks/${riskId}/restore`)).status).toBe(404);
      const [row] = await sequelize.query<{ is_deleted: boolean }>(
        `SELECT is_deleted FROM vendorrisks WHERE id = :riskId`,
        { replacements: { riskId }, type: QueryTypes.SELECT },
      );
      expect(row.is_deleted).toBe(true);
    });
  });

  describe("restoring a vendor risk", () => {
    it("brings the risk back with its values and records the restore", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { frameworks: [2] }));
      const riskId = created.body.data.id;
      await admin.delete(`/api/vendorRisks/${riskId}`);

      const res = await admin.patch(`/api/v1/vendor-risks/${riskId}/restore`);

      expect(res.status).toBe(200);
      expect(res.body.data.is_deleted).toBe(false);
      expect(res.body.data.frameworks).toEqual([2]);
      const list = await admin.get(`/api/vendorRisks/by-vendorid/${vendorId}`);
      expect(list.body.data.map((r: { id: number }) => r.id)).toEqual([riskId]);
      const entries = await history("vendor_risk", riskId);
      expect(entries[entries.length - 1]).toEqual(
        expect.objectContaining({
          action: "updated",
          field_name: "Vendor Risk",
          old_value: "Deleted",
          new_value: "Active",
          changed_by_user_id: adminId,
        }),
      );
    });

    it("answers 404 for an active, missing or other organization's risk", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const riskId = created.body.data.id;

      expect((await admin.patch(`/api/v1/vendor-risks/${riskId}/restore`)).status).toBe(404);
      expect((await admin.patch(`/api/v1/vendor-risks/999999/restore`)).status).toBe(404);
      expect((await admin.patch(`/api/v1/vendor-risks/abc/restore`)).status).toBe(400);

      await admin.delete(`/api/vendorRisks/${riskId}`);
      const otherOrg = await createTestOrganization();
      const otherAdmin = await as(otherOrg, await userIn(otherOrg, "Admin"), "Admin");
      expect((await otherAdmin.patch(`/api/v1/vendor-risks/${riskId}/restore`)).status).toBe(404);
    });

    it("needs vendor.edit", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const riskId = created.body.data.id;
      await admin.delete(`/api/vendorRisks/${riskId}`);

      for (const role of ["Reviewer", "Auditor"] as const) {
        const request = await as(orgId, await userIn(orgId, role), role);
        expect((await request.patch(`/api/v1/vendor-risks/${riskId}/restore`)).status).toBe(403);
      }
      const editor = await as(orgId, await userIn(orgId, "Editor"), "Editor");
      expect((await editor.patch(`/api/v1/vendor-risks/${riskId}/restore`)).status).toBe(200);
    });
  });

  describe("deleting a vendor", () => {
    it("records the deletion for the vendor and its active risks only", async () => {
      const vendorId = await createTestVendor(orgId);
      const active = (await admin.post("/api/vendorRisks").send(riskPayload(vendorId))).body.data
        .id;
      const alreadyDeleted = (await admin.post("/api/vendorRisks").send(riskPayload(vendorId))).body
        .data.id;
      await admin.delete(`/api/vendorRisks/${alreadyDeleted}`);

      const res = await admin.delete(`/api/vendors/${vendorId}`);

      expect(res.status).toBe(202);
      expect(await history("vendor", vendorId)).toEqual([
        expect.objectContaining({
          action: "deleted",
          field_name: "Vendor",
          changed_by_user_id: adminId,
        }),
      ]);
      expect((await history("vendor_risk", active)).filter((h) => h.action === "deleted")).toEqual([
        expect.objectContaining({ changed_by_user_id: adminId }),
      ]);
      // One entry from its own delete, none added by the vendor delete.
      expect(
        (await history("vendor_risk", alreadyDeleted)).filter((h) => h.action === "deleted"),
      ).toHaveLength(1);
    });

    it("removes custom field values, notes, task links, share links and withdraws approvals", async () => {
      const vendorId = await createTestVendor(orgId);
      const keepVendorId = await createTestVendor(orgId);
      const riskId = (await admin.post("/api/vendorRisks").send(riskPayload(vendorId))).body.data
        .id;
      await admin.delete(`/api/vendorRisks/${riskId}`);

      const vendorField = await insertId(
        `INSERT INTO custom_field_definitions (organization_id, entity_type, field_key, label, field_type)
         VALUES (:orgId, 'vendor', 'tier', 'Tier', 'text') RETURNING id`,
        { orgId },
      );
      const riskField = await insertId(
        `INSERT INTO custom_field_definitions (organization_id, entity_type, field_key, label, field_type)
         VALUES (:orgId, 'vendor_risk', 'ticket', 'Ticket', 'text') RETURNING id`,
        { orgId },
      );
      const taskId = await insertId(
        `INSERT INTO tasks (organization_id, title, creator_id)
         VALUES (:orgId, 'Review the vendor', :adminId) RETURNING id`,
        { orgId, adminId },
      );
      for (const id of [vendorId, keepVendorId]) {
        await sequelize.query(
          `INSERT INTO custom_field_values (organization_id, definition_id, entity_type, entity_id, value)
             VALUES (:orgId, :vendorField, 'vendor', :id, '"A"'::jsonb);
           INSERT INTO notes (content, author_id, attached_to, attached_to_id, organization_id, created_at, updated_at)
             VALUES ('Call them', :adminId, 'VENDOR', :idText, :orgId, NOW(), NOW());
           INSERT INTO task_entity_links (organization_id, task_id, entity_type, entity_id)
             VALUES (:orgId, :taskId, 'vendor', :id);
           INSERT INTO share_links (organization_id, share_token, resource_type, resource_id, created_by)
             VALUES (:orgId, :token, 'vendor', :id, :adminId);
           INSERT INTO approval_requests (organization_id, request_name, entity_id, entity_type, status)
             VALUES (:orgId, 'Review', :id, 'vendor', 'Pending');`,
          {
            replacements: {
              orgId,
              vendorField,
              id,
              idText: String(id),
              adminId,
              taskId,
              token: `tok-${Date.now()}-${id}`,
            },
          },
        );
      }
      await sequelize.query(
        `INSERT INTO custom_field_values (organization_id, definition_id, entity_type, entity_id, value)
         VALUES (:orgId, :riskField, 'vendor_risk', :riskId, '"VR-1"'::jsonb)`,
        { replacements: { orgId, riskField, riskId } },
      );

      expect((await admin.delete(`/api/vendors/${vendorId}`)).status).toBe(202);

      const left = async (id: number) => ({
        values: await count(
          `SELECT 1 FROM custom_field_values WHERE entity_type = 'vendor' AND entity_id = :id`,
          { id },
        ),
        notes: await count(
          `SELECT 1 FROM notes WHERE attached_to = 'VENDOR' AND attached_to_id = :idText`,
          { idText: String(id) },
        ),
        tasks: await count(
          `SELECT 1 FROM task_entity_links WHERE entity_type = 'vendor' AND entity_id = :id`,
          { id },
        ),
        shares: await count(
          `SELECT 1 FROM share_links WHERE resource_type = 'vendor' AND resource_id = :id`,
          { id },
        ),
        pending: await count(
          `SELECT 1 FROM approval_requests WHERE entity_type = 'vendor' AND entity_id = :id AND status = 'Pending'`,
          { id },
        ),
      });
      expect(await left(vendorId)).toEqual({
        values: 0,
        notes: 0,
        tasks: 0,
        shares: 0,
        pending: 0,
      });
      expect(await left(keepVendorId)).toEqual({
        values: 1,
        notes: 1,
        tasks: 1,
        shares: 1,
        pending: 1,
      });
      expect(
        await count(
          `SELECT 1 FROM approval_requests WHERE entity_type = 'vendor' AND entity_id = :vendorId AND status = 'Withdrawn'`,
          { vendorId },
        ),
      ).toBe(1);
      expect(
        await count(
          `SELECT 1 FROM custom_field_values WHERE entity_type = 'vendor_risk' AND entity_id = :riskId`,
          { riskId },
        ),
      ).toBe(0);
      expect(await count(`SELECT 1 FROM vendorrisks WHERE id = :riskId`, { riskId })).toBe(0);
    });

    it("touches nothing for an unknown vendor", async () => {
      expect((await admin.delete(`/api/vendors/999999`)).status).toBe(404);
      expect(await history("vendor", 999999)).toEqual([]);
    });
  });

  describe("history fields", () => {
    it("records use case link changes as a count, without names", async () => {
      const first = await createTestProject(orgId, adminId, { project_title: "Claims triage" });
      const second = await createTestProject(orgId, adminId, { project_title: "Fraud scoring" });
      const created = await admin.post("/api/vendors").send({
        vendor_name: "Model host",
        vendor_provides: "Hosted models",
        website: "https://example.com",
        vendor_contact_person: "Account team",
        assignee: adminId,
        projects: [first],
      });
      const vendorId = created.body.data.id;
      expect((await history("vendor", vendorId)).find((h) => h.field_name === "Use cases")).toEqual(
        expect.objectContaining({ action: "created", new_value: "1 use case" }),
      );

      await admin.patch(`/api/vendors/${vendorId}`).send({ projects: [second, first] });
      // Same set in another order: nothing.
      await admin.patch(`/api/vendors/${vendorId}`).send({ projects: [first, second] });

      const linkChanges = (await history("vendor", vendorId)).filter(
        (h) => h.field_name === "Use cases" && h.action === "updated",
      );
      expect(linkChanges).toEqual([
        expect.objectContaining({ old_value: "1 use case", new_value: "2 use cases" }),
      ]);
      // Use case titles never reach the vendor's history.
      expect(JSON.stringify(await history("vendor", vendorId))).not.toMatch(
        /Claims triage|Fraud scoring/,
      );
    });

    it("records moving a risk to another vendor and its framework changes", async () => {
      const fromVendor = await createTestVendor(orgId, { vendor_name: "Old host" });
      const toVendor = await createTestVendor(orgId, { vendor_name: "New host" });
      const created = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(fromVendor, { frameworks: [2] }));
      const riskId = created.body.data.id;
      expect((await history("vendor_risk", riskId)).filter((h) => h.action === "created")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field_name: "Vendor", new_value: "Old host" }),
          expect.objectContaining({ field_name: "Frameworks", new_value: "ISO 42001" }),
        ]),
      );

      await admin
        .patch(`/api/vendorRisks/${riskId}`)
        .send({ vendor_id: toVendor, frameworks: [3, 2] });
      await admin.patch(`/api/vendorRisks/${riskId}`).send({ frameworks: [2, 3] });

      const updates = (await history("vendor_risk", riskId)).filter((h) => h.action === "updated");
      expect(updates).toEqual([
        expect.objectContaining({
          field_name: "Vendor",
          old_value: "Old host",
          new_value: "New host",
        }),
        expect.objectContaining({
          field_name: "Frameworks",
          old_value: "ISO 42001",
          new_value: "ISO 42001, ISO 27001",
        }),
      ]);
    });

    it("shows a user from another organization as an id, not a name", async () => {
      const outsiderOrg = await createTestOrganization();
      const outsiderId = await userIn(outsiderOrg, "Admin");
      const vendorId = await createTestVendor(orgId);
      // Stored directly: the API refuses a non-member.
      await sequelize.query(`UPDATE vendors SET assignee = :outsiderId WHERE id = :vendorId`, {
        replacements: { outsiderId, vendorId },
      });

      await admin.patch(`/api/vendors/${vendorId}`).send({ assignee: adminId });

      const change = (await history("vendor", vendorId)).find((h) => h.field_name === "Assignee");
      expect(change?.old_value).toBe(`User #${outsiderId}`);
    });
  });

  describe("reports", () => {
    it("leave deleted vendor risks out", async () => {
      const projectId = await createTestProject(orgId, adminId);
      const vendorId = await createTestVendor(orgId);
      await sequelize.query(
        `INSERT INTO vendors_projects (organization_id, vendor_id, project_id) VALUES (:orgId, :vendorId, :projectId)`,
        { replacements: { orgId, vendorId, projectId } },
      );
      const kept = (await admin.post("/api/vendorRisks").send(riskPayload(vendorId))).body.data.id;
      const gone = (await admin.post("/api/vendorRisks").send(riskPayload(vendorId))).body.data.id;
      await admin.delete(`/api/vendorRisks/${gone}`);

      for (const scope of ["organization", "project"] as const) {
        const collector = new ReportDataCollector(orgId, projectId, 0, 0, adminId, scope) as any;
        const section = await collector.collectVendorRisks(scope === "organization");
        expect(section.risks.map((r: { id: number }) => r.id)).toEqual([kept]);
      }
    });
  });
});
