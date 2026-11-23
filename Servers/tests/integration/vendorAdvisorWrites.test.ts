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
jest.mock("../../services/workflows/triggers", () => ({
  ...jest.requireActual("../../services/workflows/triggers"),
  triggerVendorOnboarding: jest.fn().mockResolvedValue(undefined),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestProject, createTestVendor } from "../factories";
import { availableVendorTools } from "../../advisor/functions/vendorFunctions";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";
import { triggerVendorOnboarding } from "../../services/workflows/triggers";
import { notifyUserAssigned } from "../../services/inAppNotification.service";

/**
 * Vendors audit PR D: the Advisor's vendor write tools run as the user who
 * asked, with vendor.edit, through the console's services, against Postgres.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `vendor-advisor-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

/** The executor as the approval gateway runs it, after an Admin approved. */
const execute = (tool: string, params: Record<string, unknown>, orgId: number, by: number) =>
  writeToolExecutors.get(tool)!(
    { ...params, _requesterId: by, _userId: by },
    orgId,
  ) as Promise<any>;

type HistoryRow = { action: string; field_name: string | null; changed_by_user_id: number | null };

const history = (table: "vendor" | "vendor_risk", id: number) =>
  sequelize.query<HistoryRow>(
    `SELECT action, field_name, changed_by_user_id FROM ${table}_change_history
      WHERE ${table === "vendor" ? "vendor_id" : "vendor_risk_id"} = :id ORDER BY id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );

const vendorRows = (orgId: number) =>
  sequelize.query<{ id: number; assignee: number; vendor_provides: string }>(
    `SELECT id, assignee, vendor_provides FROM vendors WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );

const NEW_VENDOR = {
  vendor_name: "Model host",
  description: "Hosted language models",
  website: "https://example.com",
  contact_person: "Ada Lovelace",
};

describe("Advisor vendor writes through the console's services", () => {
  let orgId: number;
  let editorId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    editorId = await userIn(orgId, "Editor");
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("creates a vendor as the requester: history, assignee, onboarding, visible use cases only", async () => {
    const ownId = await createTestProject(orgId, editorId);
    const otherOwner = await userIn(orgId, "Admin");
    const hiddenId = await createTestProject(orgId, otherOwner);

    const visible = await execute(
      "agent_create_vendor",
      { ...NEW_VENDOR, project_id: ownId },
      orgId,
      editorId,
    );
    const hidden = await execute(
      "agent_create_vendor",
      { ...NEW_VENDOR, vendor_name: "Other host", project_id: hiddenId },
      orgId,
      editorId,
    );

    expect(visible).toMatchObject({ success: true, vendor_name: "Model host" });
    const [row] = (await vendorRows(orgId)).filter((v) => v.id === visible.id);
    expect(row).toMatchObject({ assignee: editorId, vendor_provides: "Hosted language models" });
    const created = await history("vendor", visible.id);
    expect(created.length).toBeGreaterThan(0);
    for (const entry of created) {
      expect(entry).toMatchObject({ action: "created", changed_by_user_id: editorId });
    }
    // The hidden use case was not linked, so its creation records no use cases.
    expect(created.map((h) => h.field_name)).toContain("Use cases");
    expect((await history("vendor", hidden.id)).map((h) => h.field_name)).not.toContain(
      "Use cases",
    );
    expect(triggerVendorOnboarding).toHaveBeenCalledWith(orgId, visible.id);

    const links = await sequelize.query<{ vendor_id: number; project_id: number }>(
      `SELECT vendor_id, project_id FROM vendors_projects WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(links).toEqual([{ vendor_id: visible.id, project_id: ownId }]);
    expect(hidden.success).toBe(true);
  });

  it("refuses an Auditor, before the approval and when it runs, writing nothing", async () => {
    const auditorId = await userIn(orgId, "Auditor");

    const proposed = await availableVendorTools.agent_create_vendor(
      { ...NEW_VENDOR, _userId: auditorId },
      orgId,
    );
    const executed = await execute("agent_create_vendor", NEW_VENDOR, orgId, auditorId);

    for (const result of [proposed, executed]) {
      expect(result).toEqual({
        success: false,
        message: "Vendor was not created: your role does not allow editing vendors.",
      });
    }
    expect(await vendorRows(orgId)).toEqual([]);
    const approvals = await sequelize.query(
      `SELECT 1 FROM ai_action_approvals WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(approvals).toEqual([]);
  });

  it("refuses a user of another organization", async () => {
    const otherOrg = await createTestOrganization();
    const outsider = await userIn(otherOrg, "Admin");
    const vendorId = await createTestVendor(orgId);

    const result = await execute("agent_delete_vendor", { vendor_id: vendorId }, orgId, outsider);

    expect(result.success).toBe(false);
    expect((await vendorRows(orgId)).map((v) => v.id)).toEqual([vendorId]);
  });

  it("answers the console's validation as a refusal: an assignee from another organization", async () => {
    const otherOrg = await createTestOrganization();
    const outsider = await userIn(otherOrg, "Editor");

    const result = await execute(
      "agent_create_vendor",
      { ...NEW_VENDOR, assignee: outsider },
      orgId,
      editorId,
    );

    expect(result).toEqual({
      success: false,
      message: "Vendor was not created: The vendor assignee must be a member of this organization",
    });
    expect(await vendorRows(orgId)).toEqual([]);
  });

  it("updates and flags a vendor with the requester in its history", async () => {
    const vendorId = await createTestVendor(orgId);

    await execute(
      "agent_update_vendor",
      { vendor_id: vendorId, contact_person: "Grace Hopper" },
      orgId,
      editorId,
    );
    await execute(
      "agent_flag_vendor_for_review",
      { vendor_id: vendorId, reason: "Contract lapsed" },
      orgId,
      editorId,
    );

    const changes = (await history("vendor", vendorId)).filter((h) => h.action === "updated");
    expect(changes.map((h) => h.changed_by_user_id)).toEqual(changes.map(() => editorId));
    expect(changes.length).toBeGreaterThanOrEqual(3);
    const [row] = await sequelize.query<{ review_status: string; review_result: string }>(
      `SELECT review_status, review_result FROM vendors WHERE id = :vendorId`,
      { replacements: { vendorId }, type: QueryTypes.SELECT },
    );
    expect(row).toEqual({ review_status: "Requires follow-up", review_result: "Contract lapsed" });
  });

  it("creates, updates and deletes a vendor risk with the requester in its history", async () => {
    const vendorId = await createTestVendor(orgId);
    const ownerId = await userIn(orgId, "Editor");

    const created = await execute(
      "agent_create_vendor_risk",
      { vendor_id: vendorId, risk_name: "Outage", risk_description: "No failover region" },
      orgId,
      editorId,
    );
    expect(created).toMatchObject({ success: true, vendor_id: vendorId });
    const riskId = created.id;

    const updated = await execute(
      "agent_update_vendor_risk",
      { vendor_risk_id: riskId, severity: "Major", action_owner: ownerId },
      orgId,
      editorId,
    );
    expect(updated.success).toBe(true);
    expect(notifyUserAssigned).toHaveBeenCalledWith(
      orgId,
      ownerId,
      expect.objectContaining({ roleType: "Action Owner", entityId: riskId }),
      expect.any(String),
      expect.any(String),
      expect.anything(),
    );

    const deleted = await execute(
      "agent_delete_vendor_risk",
      { vendor_risk_id: riskId },
      orgId,
      editorId,
    );
    expect(deleted).toEqual({ success: true, deleted: true, vendor_risk_id: riskId });

    const rows = await history("vendor_risk", riskId);
    expect(rows.map((h) => h.action)).toEqual(
      expect.arrayContaining(["created", "updated", "deleted"]),
    );
    expect(new Set(rows.map((h) => h.changed_by_user_id))).toEqual(new Set([editorId]));

    const [risk] = await sequelize.query<{ risk_level: string; is_deleted: boolean }>(
      `SELECT risk_level, is_deleted FROM vendorrisks WHERE id = :riskId`,
      { replacements: { riskId }, type: QueryTypes.SELECT },
    );
    expect(risk.is_deleted).toBe(true);
    expect(risk.risk_level).not.toBe("");

    const again = await execute(
      "agent_delete_vendor_risk",
      { vendor_risk_id: riskId },
      orgId,
      editorId,
    );
    expect(again).toEqual({ success: false, message: `Vendor risk #${riskId} not found` });
  });

  it("records a vendor delete as the requester's, not the system's", async () => {
    const vendorId = await createTestVendor(orgId);

    const result = await execute("agent_delete_vendor", { vendor_id: vendorId }, orgId, editorId);

    expect(result).toEqual({ success: true, deleted: true, vendor_id: vendorId });
    expect((await history("vendor", vendorId)).filter((h) => h.action === "deleted")).toEqual([
      expect.objectContaining({ changed_by_user_id: editorId }),
    ]);
  });
});
