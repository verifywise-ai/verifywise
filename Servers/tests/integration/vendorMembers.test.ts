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
import { updateVendorRiskByIdQuery } from "../../utils/vendorRisk.utils";
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

/** Waits until another session is blocked on a row lock running a query that matches `pattern`. */
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

/**
 * Runs `write` while another transaction has set `column` of `table` row `id`
 * to `value` and not committed yet; commits that transaction once `write` is
 * blocked on the row (at whichever statement), then returns `write`'s result.
 */
const whileAnotherSaveIsPending = async <T>(
  table: "vendors" | "vendorrisks",
  column: "assignee" | "action_owner",
  id: number,
  value: number,
  write: () => Promise<T>,
): Promise<T> => {
  const other = await sequelize.transaction();
  let pending: Promise<T>;
  try {
    await sequelize.query(`UPDATE ${table} SET ${column} = :value WHERE id = :id`, {
      replacements: { id, value },
      transaction: other,
    });
    pending = write();
    await waitForLockWait(`%${table}%`);
    await other.commit();
  } catch (error) {
    await other.rollback();
    throw error;
  }
  return pending;
};

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
        likelihood: "Possible",
        risk_severity: "Moderate",
        risk_level: "Medium risk",
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
  // The "unchanged value is not re-checked" rule compares against the stored
  // row. That row must be read and locked on the writing transaction, or a
  // save that commits in between is overwritten with the stale, non-member
  // value without any check.
  describe("a save that commits while the edit is in flight", () => {
    it("vendor: the stale assignee is checked against the newly stored one and refused", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      // Stands in for an assignee who has since left the organization.
      await setVendorUsers(vendorId, attacker.userId);

      const res = await whileAnotherSaveIsPending(
        "vendors",
        "assignee",
        vendorId,
        owner.userId,
        () =>
          owner.request
            .patch(`/api/vendors/${vendorId}`)
            .send({ assignee: attacker.userId })
            .then((r) => r),
      );

      expect(res.status).toBe(400);
      const [row] = await sequelize.query<{ assignee: number }>(
        "SELECT assignee FROM vendors WHERE id = :vendorId",
        { replacements: { vendorId }, type: QueryTypes.SELECT },
      );
      expect(row.assignee).toBe(owner.userId);
    });

    it("vendor risk: the stale action owner is checked against the newly stored one and refused", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const riskId = await createTestVendorRisk(owner.orgId, {
        vendor_id: vendorId,
        action_owner: attacker.userId,
      });

      const res = await whileAnotherSaveIsPending(
        "vendorrisks",
        "action_owner",
        riskId,
        owner.userId,
        () =>
          owner.request
            .patch(`/api/vendorRisks/${riskId}`)
            .send({ action_owner: attacker.userId })
            .then((r) => r),
      );

      expect(res.status).toBe(400);
      const [row] = await sequelize.query<{ action_owner: number }>(
        "SELECT action_owner FROM vendorrisks WHERE id = :riskId",
        { replacements: { riskId }, type: QueryTypes.SELECT },
      );
      expect(row.action_owner).toBe(owner.userId);
    });
  });
  // The Advisor's update tool calls updateVendorRiskByIdQuery directly, with
  // no REST pre-read, so the query itself must leave a deleted risk alone.
  describe("a soft-deleted vendor risk", () => {
    it("is not edited, through the query or REST, and answers like a missing one", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const riskId = await createTestVendorRisk(owner.orgId, { vendor_id: vendorId });
      await sequelize.query(
        "UPDATE vendorrisks SET is_deleted = true, deleted_at = NOW(), action_plan = 'Before' WHERE id = :riskId",
        { replacements: { riskId } },
      );

      const transaction = await sequelize.transaction();
      try {
        const result = await updateVendorRiskByIdQuery(
          riskId,
          { action_plan: "After" } as any,
          owner.orgId,
          transaction,
        );
        expect(result ?? null).toBeNull();
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      const res = await owner.request
        .patch(`/api/vendorRisks/${riskId}`)
        .send({ action_plan: "After" });
      expect(res.status).toBe(404);

      const [row] = await sequelize.query<{ action_plan: string }>(
        "SELECT action_plan FROM vendorrisks WHERE id = :riskId",
        { replacements: { riskId }, type: QueryTypes.SELECT },
      );
      expect(row.action_plan).toBe("Before");
    });
  });
  // vendor_id was never checked against the organization: a vendor risk
  // could be created on, or moved to, another organization's vendor.
  describe("a vendor risk's vendor", () => {
    const riskCount = async (vendorId: number) => {
      const [row] = await sequelize.query<{ n: string }>(
        "SELECT COUNT(*) AS n FROM vendorrisks WHERE vendor_id = :vendorId",
        { replacements: { vendorId }, type: QueryTypes.SELECT },
      );
      return Number(row.n);
    };

    it("must belong to the caller's organization on create", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const foreignVendor = await createTestVendor(attacker.orgId);

      const res = await owner.request.post("/api/vendorRisks").send({
        vendor_id: foreignVendor,
        risk_description: "Training data provenance",
        likelihood: "Possible",
        risk_severity: "Moderate",
        risk_level: "Medium risk",
        action_owner: owner.userId,
      });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("The vendor must belong to this organization");
      expect(await riskCount(foreignVendor)).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });

    it("must belong to the caller's organization on update", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const foreignVendor = await createTestVendor(attacker.orgId);
      const riskId = await createTestVendorRisk(owner.orgId, { vendor_id: vendorId });

      const res = await owner.request
        .patch(`/api/vendorRisks/${riskId}`)
        .send({ vendor_id: foreignVendor });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("The vendor must belong to this organization");
      expect(await riskCount(foreignVendor)).toBe(0);
      expect(await riskCount(vendorId)).toBe(1);
    });

    it("accepts a move to another vendor of the same organization", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const otherVendor = await createTestVendor(owner.orgId, { vendor_name: "Second vendor" });
      const riskId = await createTestVendorRisk(owner.orgId, { vendor_id: vendorId });

      const res = await owner.request
        .patch(`/api/vendorRisks/${riskId}`)
        .send({ vendor_id: otherVendor });

      expect(res.status).toBe(202);
      expect(await riskCount(otherVendor)).toBe(1);
    });
  });
  // The update used to drop a falsy action_owner, so an owner could never be
  // removed from a vendor risk.
  describe("clearing a vendor risk's action owner", () => {
    const ownerOf = async (riskId: number) => {
      const [row] = await sequelize.query<{ action_owner: number | null }>(
        "SELECT action_owner FROM vendorrisks WHERE id = :riskId",
        { replacements: { riskId }, type: QueryTypes.SELECT },
      );
      return row.action_owner;
    };

    it("writes NULL for null and for an empty value, and sends no email", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);

      for (const cleared of [null, ""]) {
        const riskId = await createTestVendorRisk(owner.orgId, {
          vendor_id: vendorId,
          action_owner: owner.userId,
        });
        const res = await owner.request
          .patch(`/api/vendorRisks/${riskId}`)
          .send({ action_owner: cleared });
        expect(res.status).toBe(202);
        expect(await ownerOf(riskId)).toBeNull();
      }
      expect(notify).not.toHaveBeenCalled();
    });

    it("leaves the owner alone when the update does not send one", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const riskId = await createTestVendorRisk(owner.orgId, {
        vendor_id: vendorId,
        action_owner: owner.userId,
      });

      const res = await owner.request
        .patch(`/api/vendorRisks/${riskId}`)
        .send({ action_plan: "Re-check in Q1" });

      expect(res.status).toBe(202);
      expect(await ownerOf(riskId)).toBe(owner.userId);
    });
  });
});
