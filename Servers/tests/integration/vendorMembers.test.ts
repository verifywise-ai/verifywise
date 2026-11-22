jest.setTimeout(60000);

// Automations and vendor risk link scoring would enqueue to Redis after
// commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn().mockResolvedValue(undefined),
  enqueueVendorRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
}));

// The assignment email and in-app notice go through notifyUserAssigned; the
// spy shows whether one was sent and to whom.
jest.mock("../../services/inAppNotification.service", () => ({
  ...jest.requireActual("../../services/inAppNotification.service"),
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
}));

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor, createTestVendorRisk } from "../factories";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { createNewVendorQuery } from "../../utils/vendor.utils";
import { IVendor } from "../../domain.layer/interfaces/i.vendor";

const notify = notifyUserAssigned as jest.Mock;

const vendorPayload = (assignee: number, reviewer?: number) => ({
  vendor_name: "Model host",
  vendor_provides: "Hosted language models",
  website: "https://example.com",
  vendor_contact_person: "Account team",
  assignee,
  ...(reviewer !== undefined ? { reviewer } : {}),
});

const setVendorUsers = (vendorId: number, assignee: number, reviewer: number | null = null) =>
  sequelize.query("UPDATE vendors SET assignee = :assignee, reviewer = :reviewer WHERE id = :id", {
    replacements: { id: vendorId, assignee, reviewer },
  });

const vendorCount = async (orgId: number) => {
  const [row] = await sequelize.query<{ n: string }>(
    "SELECT COUNT(*) AS n FROM vendors WHERE organization_id = :orgId",
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  return Number(row.n);
};

const notifiedUsers = () => notify.mock.calls.map((call) => call[1]);

// assignee, reviewer and a vendor risk's action_owner are user ids. A user of
// another organization used to be accepted and was then sent the assignment
// email with the vendor's name and description.
describe("vendor user references against organization_members", () => {
  beforeEach(() => {
    notify.mockClear();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("create", () => {
    it("accepts members as assignee and reviewer and notifies them", async () => {
      const { owner } = await seedTwoTenantContexts();

      const res = await owner.request
        .post("/api/vendors")
        .send(vendorPayload(owner.userId, owner.userId));

      expect(res.status).toBe(201);
      expect(notifiedUsers()).toEqual([owner.userId, owner.userId]);
    });

    it("refuses another organization's user as assignee, writes nothing and sends no email", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();

      const res = await owner.request.post("/api/vendors").send(vendorPayload(attacker.userId));

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("assignee");
      expect(await vendorCount(owner.orgId)).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });

    it("refuses another organization's user as reviewer", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();

      const res = await owner.request
        .post("/api/vendors")
        .send(vendorPayload(owner.userId, attacker.userId));

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("reviewer");
      expect(await vendorCount(owner.orgId)).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("refuses another organization's user as assignee and sends no email", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      await setVendorUsers(vendorId, owner.userId);

      const res = await owner.request
        .patch(`/api/vendors/${vendorId}`)
        .send({ assignee: attacker.userId });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("assignee");
      expect(notify).not.toHaveBeenCalled();
      const [row] = await sequelize.query<{ assignee: number }>(
        "SELECT assignee FROM vendors WHERE id = :vendorId",
        { replacements: { vendorId }, type: QueryTypes.SELECT },
      );
      expect(row.assignee).toBe(owner.userId);
    });

    it("refuses another organization's user as reviewer and sends no email", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      await setVendorUsers(vendorId, owner.userId);

      const res = await owner.request
        .patch(`/api/vendors/${vendorId}`)
        .send({ reviewer: attacker.userId });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("reviewer");
      expect(notify).not.toHaveBeenCalled();
    });

    it("accepts a member as the new reviewer", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      await setVendorUsers(vendorId, owner.userId);

      const res = await owner.request
        .patch(`/api/vendors/${vendorId}`)
        .send({ reviewer: owner.userId });

      expect(res.status).toBe(202);
      expect(res.body?.data?.reviewer).toBe(owner.userId);
    });

    it("still edits a vendor whose stored assignee and reviewer are no longer members", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      // Stands in for users removed from the organization after assignment.
      await setVendorUsers(vendorId, attacker.userId, attacker.userId);

      const fieldOnly = await owner.request
        .patch(`/api/vendors/${vendorId}`)
        .send({ review_status: "In review" });
      expect(fieldOnly.status).toBe(202);

      // The vendor drawer sends the unchanged people back with the other fields.
      const samePeople = await owner.request.patch(`/api/vendors/${vendorId}`).send({
        review_status: "Reviewed",
        assignee: attacker.userId,
        reviewer: attacker.userId,
      });
      expect(samePeople.status).toBe(202);
      expect(samePeople.body?.data?.review_status).toBe("Reviewed");
    });
  });

  describe("vendor risk action owner", () => {
    const riskPayload = (vendorId: number, actionOwner: number) => ({
      vendor_id: vendorId,
      risk_description: "Training data provenance",
      impact_description: "Biased scoring",
      likelihood: "Possible",
      risk_severity: "Moderate",
      action_plan: "Ask for model cards",
      action_owner: actionOwner,
      risk_level: "Medium risk",
    });

    it("accepts a member and refuses another organization's user on create", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);

      const ok = await owner.request
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, owner.userId));
      expect(ok.status).toBe(201);
      expect(notifiedUsers()).toEqual([owner.userId]);
      notify.mockClear();

      const refused = await owner.request
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, attacker.userId));
      expect(refused.status).toBe(400);
      expect(JSON.stringify(refused.body)).toContain("action owner");
      expect(notify).not.toHaveBeenCalled();
    });

    it("refuses another organization's user on update and keeps a stored owner who left", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const memberRisk = await createTestVendorRisk(owner.orgId, {
        vendor_id: vendorId,
        action_owner: owner.userId,
      });

      const refused = await owner.request
        .patch(`/api/vendorRisks/${memberRisk}`)
        .send({ action_owner: attacker.userId });
      expect(refused.status).toBe(400);
      expect(JSON.stringify(refused.body)).toContain("action owner");
      expect(notify).not.toHaveBeenCalled();

      const leftRisk = await createTestVendorRisk(owner.orgId, {
        vendor_id: vendorId,
        action_owner: attacker.userId,
      });
      const kept = await owner.request
        .patch(`/api/vendorRisks/${leftRisk}`)
        .send({ action_plan: "Re-check in Q1", action_owner: attacker.userId });
      expect(kept.status).toBe(202);
    });
  });
  // A name or other non-id where a user id is expected is a malformed
  // request, not an outsider: it gets its own message, still a 400.
  describe("a value that is not a user id", () => {
    it("is refused on a vendor risk as not a valid user id, on create and update", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);

      const created = await owner.request.post("/api/vendorRisks").send({
        vendor_id: vendorId,
        risk_description: "Training data provenance",
        action_owner: "Jane Doe",
      });
      expect(created.status).toBe(400);
      expect(JSON.stringify(created.body)).toContain("The action owner is not a valid user id");

      const riskId = await createTestVendorRisk(owner.orgId, {
        vendor_id: vendorId,
        action_owner: owner.userId,
      });
      const updated = await owner.request
        .patch(`/api/vendorRisks/${riskId}`)
        .send({ action_owner: "Jane Doe" });
      expect(updated.status).toBe(400);
      expect(JSON.stringify(updated.body)).toContain("The action owner is not a valid user id");
      expect(notify).not.toHaveBeenCalled();
    });

    it("is refused on a vendor written outside REST (Advisor, import) as not a valid user id", async () => {
      const { owner } = await seedTwoTenantContexts();
      const transaction = await sequelize.transaction();
      try {
        await expect(
          createNewVendorQuery(
            { ...vendorPayload(owner.userId), assignee: "Jane Doe" } as unknown as IVendor,
            owner.orgId,
            transaction,
          ),
        ).rejects.toThrow("The vendor assignee is not a valid user id");
      } finally {
        await transaction.rollback();
      }
      expect(await vendorCount(owner.orgId)).toBe(0);
    });
  });
});
