jest.setTimeout(60000);

// Automations and vendor risk link scoring enqueue to Redis; the spy shows
// whether an automation was enqueued.
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
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import { notifyUserAssigned } from "../../services/inAppNotification.service";

/**
 * Vendor and vendor risk REST writes (vendors audit PR A): use case links an
 * Editor can't see, request validation, framework ids, clearing fields, ids
 * in the URL and the list filter.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

const enqueue = enqueueAutomationAction as jest.Mock;
const notify = notifyUserAssigned as jest.Mock;

let counter = 0;
async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `vendor-writes-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function as(orgId: number, userId: number, role: RoleName) {
  return testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
}

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId } },
  );
}

async function linkVendor(orgId: number, vendorId: number, projectId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO vendors_projects (organization_id, vendor_id, project_id)
     VALUES (:orgId, :vendorId, :projectId)`,
    { replacements: { orgId, vendorId, projectId } },
  );
}

async function vendorLinks(vendorId: number): Promise<number[]> {
  const rows = await sequelize.query<{ project_id: number }>(
    `SELECT project_id FROM vendors_projects WHERE vendor_id = :vendorId ORDER BY project_id`,
    { replacements: { vendorId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.project_id);
}

async function riskFrameworks(vendorRiskId: number): Promise<number[]> {
  const rows = await sequelize.query<{ framework_id: number }>(
    `SELECT framework_id FROM frameworks_vendorrisks WHERE vendorrisk_id = :id ORDER BY framework_id`,
    { replacements: { id: vendorRiskId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.framework_id);
}

async function vendorRiskCount(orgId: number): Promise<number> {
  const [row] = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM vendorrisks WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  return row.n;
}

async function activateAutomation(orgId: number, triggerKey: string): Promise<void> {
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
        params: JSON.stringify({ subject: "Vendor {{vendor.name}}", body: "Changed" }),
      },
    },
  );
}

const riskPayload = (vendorId: number, extra: Record<string, unknown> = {}) => ({
  vendor_id: vendorId,
  risk_description: "Training data provenance",
  impact_description: "Biased scoring",
  likelihood: "Possible",
  risk_severity: "Moderate",
  action_plan: "Ask for model cards",
  risk_level: "Medium risk",
  ...extra,
});

describe("vendor and vendor risk writes", () => {
  let orgId: number;
  let adminId: number;
  let admin: Awaited<ReturnType<typeof as>>;

  beforeEach(async () => {
    enqueue.mockClear();
    notify.mockClear();
    await seedFrameworks();
    orgId = await createTestOrganization();
    adminId = await userIn(orgId, "Admin");
    admin = await as(orgId, adminId, "Admin");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("use case links", () => {
    it("lets an Editor save a vendor linked to a use case they can't see, keeping that link", async () => {
      const editorId = await userIn(orgId, "Editor");
      const mine = await createTestProject(orgId, adminId);
      const hidden = await createTestProject(orgId, adminId);
      await addMember(orgId, mine, editorId);
      const vendorId = await createTestVendor(orgId);
      await linkVendor(orgId, vendorId, mine);
      await linkVendor(orgId, vendorId, hidden);
      const editor = await as(orgId, editorId, "Editor");

      // The page sends the vendor's links back as it got them.
      const res = await editor
        .patch(`/api/vendors/${vendorId}`)
        .send({ vendor_name: "Renamed", projects: [mine, hidden] });

      expect(res.status).toBe(202);
      expect(res.body.data.vendor_name).toBe("Renamed");
      expect(await vendorLinks(vendorId)).toEqual([mine, hidden].sort((a, b) => a - b));
    });

    it("lets an Editor add and remove only links to use cases they can see", async () => {
      const editorId = await userIn(orgId, "Editor");
      const mine = await createTestProject(orgId, adminId);
      const another = await createTestProject(orgId, adminId);
      const hidden = await createTestProject(orgId, adminId);
      const hiddenUnlinked = await createTestProject(orgId, adminId);
      await addMember(orgId, mine, editorId);
      await addMember(orgId, another, editorId);
      const vendorId = await createTestVendor(orgId);
      await linkVendor(orgId, vendorId, mine);
      await linkVendor(orgId, vendorId, hidden);
      const editor = await as(orgId, editorId, "Editor");

      // Drops `mine`, adds `another`, leaves out `hidden`, and names a use
      // case it can't see: only the visible links change.
      const res = await editor
        .patch(`/api/vendors/${vendorId}`)
        .send({ projects: [another, hiddenUnlinked] });

      expect(res.status).toBe(202);
      expect(await vendorLinks(vendorId)).toEqual([another, hidden].sort((a, b) => a - b));
      expect([...res.body.data.projects].sort((a: number, b: number) => a - b)).toEqual(
        [another, hidden].sort((a, b) => a - b),
      );
    });

    it("links a new vendor only to use cases its creator can see", async () => {
      const editorId = await userIn(orgId, "Editor");
      const mine = await createTestProject(orgId, adminId);
      const hidden = await createTestProject(orgId, adminId);
      await addMember(orgId, mine, editorId);
      const editor = await as(orgId, editorId, "Editor");

      const res = await editor.post("/api/vendors").send({
        vendor_name: "Model host",
        vendor_provides: "Hosted models",
        website: "https://example.com",
        vendor_contact_person: "Account team",
        assignee: editorId,
        projects: [String(mine), hidden],
      });

      expect(res.status).toBe(201);
      expect(await vendorLinks(res.body.data.id)).toEqual([mine]);
      expect(res.body.data.projects).toEqual([mine]);
    });

    it("unlinks every visible use case on projects: [] and keeps links on a field-only save", async () => {
      const first = await createTestProject(orgId, adminId);
      const second = await createTestProject(orgId, adminId);
      const vendorId = await createTestVendor(orgId);
      await linkVendor(orgId, vendorId, first);
      await linkVendor(orgId, vendorId, second);

      const fieldOnly = await admin
        .patch(`/api/vendors/${vendorId}`)
        .send({ review_status: "In review" });
      expect(fieldOnly.status).toBe(202);
      expect(await vendorLinks(vendorId)).toHaveLength(2);

      const cleared = await admin.patch(`/api/vendors/${vendorId}`).send({ projects: [] });
      expect(cleared.status).toBe(202);
      expect(await vendorLinks(vendorId)).toEqual([]);
      expect(cleared.body.data.projects).toEqual([]);
    });
  });

  describe("vendor request checks", () => {
    it("saves a partial edit of an imported vendor whose required fields are empty", async () => {
      const vendorId = await createTestVendor(orgId, { website: "", vendor_contact_person: "" });

      const res = await admin.patch(`/api/vendors/${vendorId}`).send({ review_status: "Reviewed" });

      expect(res.status).toBe(202);
      expect(res.body.data.review_status).toBe("Reviewed");
    });

    it("accepts a review date string, a 255-character name with spaces around it, and projects: null", async () => {
      const project = await createTestProject(orgId, adminId);
      const vendorId = await createTestVendor(orgId);
      await linkVendor(orgId, vendorId, project);

      const res = await admin.patch(`/api/vendors/${vendorId}`).send({
        review_date: "2026-03-01T10:00:00.000Z",
        vendor_name: `  ${"x".repeat(255)}  `,
        projects: null,
      });

      expect(res.status).toBe(202);
      expect(res.body.data.vendor_name).toBe("x".repeat(255));
      expect(await vendorLinks(vendorId)).toEqual([project]);
    });

    it("still refuses to clear a required field", async () => {
      const vendorId = await createTestVendor(orgId);
      const res = await admin.patch(`/api/vendors/${vendorId}`).send({ website: "" });
      expect(res.status).toBe(400);
    });

    it.each([
      ["an unknown review status", { review_status: "Banana" }],
      ["an unknown data sensitivity", { data_sensitivity: "Very" }],
      ["a use case id that is not a number", { projects: ["abc"] }],
      ["use cases that are not a list", { projects: 3 }],
      ["a vendor name over 255 characters", { vendor_name: "x".repeat(256) }],
      ["a review date that is not a date", { review_date: "someday" }],
      ["a review date sent as a number", { review_date: 1700000000000 }],
      ["a review date on a day that doesn't exist", { review_date: "2026-02-30" }],
      ["an order number beyond a database integer", { order_no: 99999999999 }],
      ["a reviewer that is not an id", { reviewer: "bob" }],
    ])("answers 400 for %s", async (_label, body) => {
      const vendorId = await createTestVendor(orgId);
      const res = await admin.patch(`/api/vendors/${vendorId}`).send(body);
      expect(res.status).toBe(400);
    });

    it("answers 400 on create for a bad enum instead of a database error", async () => {
      const res = await admin.post("/api/vendors").send({
        vendor_name: "Model host",
        vendor_provides: "Hosted models",
        website: "https://example.com",
        vendor_contact_person: "Account team",
        assignee: adminId,
        business_criticality: "Extreme",
      });
      expect(res.status).toBe(400);
    });

    it.each(["abc", "12abc", "1.5", "-3"])("answers 400 for vendor id %s", async (id) => {
      expect((await admin.get(`/api/vendors/${id}`)).status).toBe(400);
      expect((await admin.patch(`/api/vendors/${id}`).send({ vendor_name: "x" })).status).toBe(400);
      expect((await admin.delete(`/api/vendors/${id}`)).status).toBe(400);
    });

    it("answers 404, and sends no email, when deleting a vendor that doesn't exist with a delete automation on", async () => {
      await activateAutomation(orgId, "vendor_deleted");

      const res = await admin.delete("/api/vendors/999999");

      expect(res.status).toBe(404);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it("enqueues the delete automation once the delete has committed", async () => {
      await activateAutomation(orgId, "vendor_deleted");
      const vendorId = await createTestVendor(orgId);

      const res = await admin.delete(`/api/vendors/${vendorId}`);

      expect(res.status).toBe(202);
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe("vendor risk frameworks", () => {
    it("refuses an unknown framework on create and saves nothing", async () => {
      const vendorId = await createTestVendor(orgId);

      const res = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { frameworks: [99999] }));

      expect(res.status).toBe(400);
      expect(await vendorRiskCount(orgId)).toBe(0);
    });

    it("saves a repeated framework id once", async () => {
      const vendorId = await createTestVendor(orgId);

      const res = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { frameworks: [1, 1, 2] }));

      expect(res.status).toBe(201);
      expect(await riskFrameworks(res.body.data.id)).toEqual([1, 2]);
    });

    it("refuses an unknown framework on update and keeps the risk as it was", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { frameworks: [1] }));
      const id = created.body.data.id;

      const res = await admin
        .patch(`/api/vendorRisks/${id}`)
        .send({ risk_description: "Changed", frameworks: [99999] });

      expect(res.status).toBe(400);
      expect(await riskFrameworks(id)).toEqual([1]);
      const [row] = await sequelize.query<{ risk_description: string }>(
        `SELECT risk_description FROM vendorrisks WHERE id = :id`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      expect(row.risk_description).toBe("Training data provenance");
    });

    it("leaves the framework links alone on frameworks: null", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { frameworks: [1] }));
      const id = created.body.data.id;

      const res = await admin
        .patch(`/api/vendorRisks/${id}`)
        .send({ risk_description: "Changed", frameworks: null });

      expect(res.status).toBe(202);
      expect(await riskFrameworks(id)).toEqual([1]);
    });

    it("saves an update that changes only frameworks", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { frameworks: [1] }));
      const id = created.body.data.id;

      const res = await admin.patch(`/api/vendorRisks/${id}`).send({ frameworks: [2, 3] });

      expect(res.status).toBe(202);
      expect(await riskFrameworks(id)).toEqual([2, 3]);
    });
  });

  describe("vendor risk fields", () => {
    it("clears the action plan and impact description", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const id = created.body.data.id;

      const res = await admin
        .patch(`/api/vendorRisks/${id}`)
        .send({ action_plan: "", impact_description: null });

      expect(res.status).toBe(202);
      const [row] = await sequelize.query<{
        action_plan: string | null;
        impact_description: string | null;
      }>(`SELECT action_plan, impact_description FROM vendorrisks WHERE id = :id`, {
        replacements: { id },
        type: QueryTypes.SELECT,
      });
      expect(row.action_plan).toBe("");
      expect(row.impact_description).toBeNull();
    });

    it.each([
      ["with an unknown severity", { risk_severity: "High" }],
      ["with an unknown likelihood", { likelihood: "Sometimes" }],
      ["with a vendor id that is not a number", { vendor_id: "abc" }],
      ["with frameworks that are not a list", { frameworks: "1" }],
    ])("answers 400 on create %s", async (_label, extra) => {
      const vendorId = await createTestVendor(orgId);
      const res = await admin.post("/api/vendorRisks").send(riskPayload(vendorId, extra));
      expect(res.status).toBe(400);
      expect(await vendorRiskCount(orgId)).toBe(0);
    });

    it.each([
      ["Almost Certain", "Almost certain"],
      ["possible", "Possible"],
      [" LIKELY ", "Likely"],
    ])("saves likelihood %j as %j", async (sent, stored) => {
      const vendorId = await createTestVendor(orgId);
      const res = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { likelihood: sent }));
      expect(res.status).toBe(201);
      expect(res.body.data.likelihood).toBe(stored);
    });

    it("sends no assignment email when the action owner is re-sent unchanged as a string", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { action_owner: adminId }));
      notify.mockClear();

      const res = await admin
        .patch(`/api/vendorRisks/${created.body.data.id}`)
        .send({ action_owner: String(adminId), risk_description: "Changed" });

      expect(res.status).toBe(202);
      expect(notify).not.toHaveBeenCalled();
    });

    it("refuses to blank a required field on update", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const res = await admin
        .patch(`/api/vendorRisks/${created.body.data.id}`)
        .send({ risk_severity: "" });
      expect(res.status).toBe(400);
    });

    it.each(["abc", "12abc"])("answers 400 for vendor risk id %s", async (id) => {
      expect((await admin.get(`/api/vendorRisks/${id}`)).status).toBe(400);
      expect((await admin.patch(`/api/vendorRisks/${id}`).send({})).status).toBe(400);
      expect((await admin.delete(`/api/vendorRisks/${id}`)).status).toBe(400);
    });

    it("answers 404 when deleting a vendor risk that doesn't exist", async () => {
      expect((await admin.delete("/api/vendorRisks/999999")).status).toBe(404);
    });

    it("answers 400 for an unknown list filter", async () => {
      const vendorId = await createTestVendor(orgId);
      expect((await admin.get("/api/vendorRisks/all?filter=everything")).status).toBe(400);
      expect(
        (await admin.get(`/api/vendorRisks/by-vendorid/${vendorId}?filter=everything`)).status,
      ).toBe(400);
      expect((await admin.get("/api/vendorRisks/all?filter=deleted")).status).toBe(200);
    });
  });
});
