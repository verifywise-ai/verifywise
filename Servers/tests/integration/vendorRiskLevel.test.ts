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
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestVendor } from "../factories";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const recompute = require("../../database/migrations/20261122200000-vendor-risk-level-and-score-recompute.js");

/**
 * The server owns a vendor risk's level and a vendor's risk score (vendors
 * audit PR B): both are computed on every write, whatever the request sends,
 * and the migration brings stored rows in line.
 */

const riskPayload = (vendorId: number, extra: Record<string, unknown> = {}) => ({
  vendor_id: vendorId,
  risk_description: "Training data provenance",
  impact_description: "Biased scoring",
  likelihood: "Possible",
  risk_severity: "Moderate",
  action_plan: "Ask for model cards",
  ...extra,
});

const vendorPayload = (assignee: number, extra: Record<string, unknown> = {}) => ({
  vendor_name: "Model host",
  vendor_provides: "Hosted models",
  website: "https://example.com",
  vendor_contact_person: "Account team",
  assignee,
  ...extra,
});

async function storedLevel(id: number): Promise<string | null> {
  const [row] = await sequelize.query<{ risk_level: string | null }>(
    `SELECT risk_level FROM vendorrisks WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row.risk_level;
}

async function storedScore(id: number): Promise<number | null> {
  const [row] = await sequelize.query<{ risk_score: number | null }>(
    `SELECT risk_score FROM vendors WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row.risk_score;
}

describe("server-owned vendor risk level and vendor risk score", () => {
  let orgId: number;
  let adminId: number;
  let admin: ReturnType<typeof testRequest>;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    adminId = await createTestUser(orgId, 1, `level-${Date.now()}@test.com`, "Pw123456!");
    admin = testRequest(
      await createTestApp({
        bypassAuth: true,
        mockUser: { userId: adminId, organizationId: orgId, role: "Admin" },
      }),
    );
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("vendor risk level", () => {
    it("computes the level on create and ignores the one sent", async () => {
      const vendorId = await createTestVendor(orgId);

      const res = await admin
        .post("/api/vendorRisks")
        .send(riskPayload(vendorId, { risk_level: "banana" }));

      // 3 (Possible) + 3 * 3 (Moderate) = 12
      expect(res.status).toBe(201);
      expect(await storedLevel(res.body.data.id)).toBe("Medium risk");
    });

    it("creates a vendor risk without a level", async () => {
      const vendorId = await createTestVendor(orgId);
      const res = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      expect(res.status).toBe(201);
      expect(res.body.data.risk_level).toBe("Medium risk");
    });

    it("recomputes the level when only likelihood or severity changes", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const id = created.body.data.id;

      // 5 (Almost certain) + 3 * 3 = 14
      await admin.patch(`/api/vendorRisks/${id}`).send({ likelihood: "Almost certain" });
      expect(await storedLevel(id)).toBe("High risk");

      // 5 + 3 * 5 (Catastrophic) = 20
      await admin
        .patch(`/api/vendorRisks/${id}`)
        .send({ risk_severity: "Catastrophic", risk_level: "Low risk" });
      expect(await storedLevel(id)).toBe("Very high risk");

      // 1 (Rare) + 3 * 1 (Negligible) = 4
      await admin
        .patch(`/api/vendorRisks/${id}`)
        .send({ likelihood: "Rare", risk_severity: "Negligible" });
      expect(await storedLevel(id)).toBe("No risk");
    });

    it("keeps the level of an older risk without likelihood or severity on an edit", async () => {
      const vendorId = await createTestVendor(orgId);
      const [legacy] = await sequelize.query<{ id: number }>(
        `INSERT INTO vendorrisks (organization_id, vendor_id, risk_description, risk_level)
         VALUES (:orgId, :vendorId, 'Legacy', 'High risk') RETURNING id`,
        { replacements: { orgId, vendorId }, type: QueryTypes.SELECT },
      );

      const res = await admin
        .patch(`/api/vendorRisks/${legacy.id}`)
        .send({ action_plan: "Ask for the audit report" });

      expect(res.status).toBe(202);
      expect(await storedLevel(legacy.id)).toBe("High risk");
    });

    it("corrects a stale level on any update", async () => {
      const vendorId = await createTestVendor(orgId);
      const created = await admin.post("/api/vendorRisks").send(riskPayload(vendorId));
      const id = created.body.data.id;
      await sequelize.query(`UPDATE vendorrisks SET risk_level = 'banana' WHERE id = :id`, {
        replacements: { id },
      });

      await admin.patch(`/api/vendorRisks/${id}`).send({ risk_description: "Reworded" });

      expect(await storedLevel(id)).toBe("Medium risk");
    });
  });

  describe("vendor risk score", () => {
    it("is null for a vendor with no scorecard answer, whatever is sent", async () => {
      const res = await admin.post("/api/vendors").send(vendorPayload(adminId, { risk_score: 0 }));
      expect(res.status).toBe(201);
      expect(await storedScore(res.body.data.id)).toBeNull();
      expect(res.body.data.risk_score).toBeNull();
    });

    it("is computed from the answers on create and ignores the score sent", async () => {
      const res = await admin
        .post("/api/vendors")
        .send(vendorPayload(adminId, { data_sensitivity: "Financial data", risk_score: 99 }));
      expect(res.status).toBe(201);
      expect(await storedScore(res.body.data.id)).toBe(24);
    });

    it("follows the stored answers when an update changes one of them", async () => {
      const created = await admin
        .post("/api/vendors")
        .send(vendorPayload(adminId, { data_sensitivity: "Financial data" }));
      const id = created.body.data.id;

      // 24 + 0.3 * 3/3 = 24 + 30
      const res = await admin
        .patch(`/api/vendors/${id}`)
        .send({ business_criticality: "High (critical to core services or products)" });
      expect(res.status).toBe(202);
      expect(await storedScore(id)).toBe(54);

      // Clearing every answer: not assessed again.
      await admin
        .patch(`/api/vendors/${id}`)
        .send({ data_sensitivity: "", business_criticality: "" });
      expect(await storedScore(id)).toBeNull();
    });
  });

  describe("recompute migration", () => {
    it("fixes stale levels and scores and leaves rows it can't compute", async () => {
      const vendorId = await createTestVendor(orgId);
      const unassessed = await createTestVendor(orgId);
      await sequelize.query(
        `UPDATE vendors SET data_sensitivity = 'Financial data', risk_score = 0 WHERE id = :vendorId;
         UPDATE vendors SET risk_score = 0 WHERE id = :unassessed;`,
        { replacements: { vendorId, unassessed } },
      );
      const [stale] = await sequelize.query<{ id: number }>(
        `INSERT INTO vendorrisks (organization_id, vendor_id, risk_description, likelihood, risk_severity, risk_level)
         VALUES (:orgId, :vendorId, 'Stale', 'Likely', 'Major', 'Low risk') RETURNING id`,
        { replacements: { orgId, vendorId }, type: QueryTypes.SELECT },
      );
      const [incomplete] = await sequelize.query<{ id: number }>(
        `INSERT INTO vendorrisks (organization_id, vendor_id, risk_description, risk_level)
         VALUES (:orgId, :vendorId, 'No inputs', 'Medium risk') RETURNING id`,
        { replacements: { orgId, vendorId }, type: QueryTypes.SELECT },
      );

      await recompute.up(sequelize.getQueryInterface());

      // 4 (Likely) + 3 * 4 (Major) = 16
      expect(await storedLevel(stale.id)).toBe("High risk");
      expect(await storedLevel(incomplete.id)).toBe("Medium risk");
      expect(await storedScore(vendorId)).toBe(24);
      expect(await storedScore(unassessed)).toBeNull();

      // The stale-inheritance trigger was off only for the correction.
      const [trigger] = await sequelize.query<{ tgenabled: string }>(
        `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_vendorrisks_flag_stale'`,
        { type: QueryTypes.SELECT },
      );
      expect(trigger.tgenabled).toBe("O");
    });
  });
});
