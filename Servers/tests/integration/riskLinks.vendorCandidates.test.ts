jest.setTimeout(60000);

// Mock only the Redis transport: the notifier under test is REAL, so this file
// proves actual `notifications` rows are written. The integration setup module
// is deliberately NOT imported, as in riskLinks.modelCandidates.test.ts.
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
  REDIS_URL: "redis://localhost:6379/0",
}));

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedTwoOrgsAndUsers, seedFrameworks } from "./helpers";
import { sequelize } from "../../database/db";
import {
  createTestProject,
  createTestRisk,
  createTestVendor,
  createTestVendorRisk,
  linkRiskToProject,
  linkVendorToProject,
} from "../factories";
import { notifyVendorRiskCandidates } from "../../services/riskLinks/vendorCandidates";
import { notifyRiskOfVendorCandidates } from "../../services/inAppNotification.service";

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
});

interface NotificationRow {
  user_id: number;
  type: string;
  entity_type: string;
  entity_id: number;
  message: string;
  metadata: { vendor_id: number; vendor_risk_ids: number[] };
}

const notificationRows = async (orgId: number): Promise<NotificationRow[]> =>
  (await sequelize.query(
    `SELECT user_id, type, entity_type, entity_id, message, metadata
       FROM notifications
      WHERE organization_id = :orgId
      ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as NotificationRow[];

const insertLink = (
  orgId: number,
  source: number,
  target: { vendorRisk?: number; risk?: number },
  status: "confirmed" | "dismissed" = "confirmed",
) =>
  sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, target_vendor_risk_id, relation_type, status, source)
     VALUES (:orgId, :source, :risk, :vendorRisk, 'inherits_from', :status, 'user')`,
    {
      replacements: {
        orgId,
        source,
        risk: target.risk ?? null,
        vendorRisk: target.vendorRisk ?? null,
        status,
      },
    },
  );

/** A vendor serving one use case, with the given number of vendor risks. */
async function vendorInUseCase(orgId: number, userId: number, vendorRisks = 1) {
  const project = await createTestProject(orgId, userId, {});
  const vendor = await createTestVendor(orgId, { vendor_name: "Acme Cloud" });
  await linkVendorToProject(orgId, vendor, project);
  const riskIds: number[] = [];
  for (let i = 0; i < vendorRisks; i++) {
    riskIds.push(await createTestVendorRisk(orgId, { vendor_id: vendor }));
  }
  return { project, vendor, vendorRiskIds: riskIds };
}

describe("vendor risk candidate notices", () => {
  it("tells each owner of a risk in the vendor's use cases what it could inherit from", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const { project, vendor } = await vendorInUseCase(seed.orgA, seed.userA, 2);
    const riskA = await createTestRisk(seed.orgA, { risk_owner: seed.userA, risk_name: "Loans" });
    const riskB = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, riskA, project);
    await linkRiskToProject(seed.orgA, riskB, project);

    const summary = await notifyVendorRiskCandidates({
      organizationId: seed.orgA,
      vendorId: vendor,
      vendorName: "Acme Cloud",
      projectIds: [project],
    });

    expect(summary).toEqual({
      organization_id: seed.orgA,
      vendor_id: vendor,
      risks: 2,
      candidates: 4,
      notified: 2,
    });
    const rows = await notificationRows(seed.orgA);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: seed.userA,
      type: "vendor_risk_candidates",
      entity_type: "risk",
      entity_id: riskA,
      metadata: { vendor_id: vendor, vendor_risk_ids: [] },
    });
    expect(rows[0].message).toContain('"Loans"');
    expect(rows[0].message).toContain('"Acme Cloud"');
    expect(rows[0].message).toContain("2 vendor risks");
  });

  it("leaves out risks that are linked to it already, or already sit in a hierarchy", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const {
      project,
      vendor,
      vendorRiskIds: [vendorRisk],
    } = await vendorInUseCase(seed.orgA, seed.userA);
    const owned = () => createTestRisk(seed.orgA, { risk_owner: seed.userA });
    const fresh = await owned();
    const dismissedPair = await owned();
    const hasParent = await owned();
    const hasChild = await owned();
    const parent = await owned();
    const child = await owned();
    const deleted = await owned();
    for (const risk of [fresh, dismissedPair, hasParent, hasChild, deleted]) {
      await linkRiskToProject(seed.orgA, risk, project);
    }
    await insertLink(seed.orgA, dismissedPair, { vendorRisk }, "dismissed");
    await insertLink(seed.orgA, hasParent, { risk: parent });
    await insertLink(seed.orgA, child, { risk: hasChild });
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :deleted`, {
      replacements: { deleted },
    });

    const summary = await notifyVendorRiskCandidates({
      organizationId: seed.orgA,
      vendorId: vendor,
      vendorName: "Acme Cloud",
      projectIds: [project],
    });

    expect(summary.risks).toBe(1);
    expect((await notificationRows(seed.orgA)).map((row) => row.entity_id)).toEqual([fresh]);
  });

  it("does not repeat itself when the vendor gains another use case", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const { project, vendor } = await vendorInUseCase(seed.orgA, seed.userA);
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, project);
    const input = {
      organizationId: seed.orgA,
      vendorId: vendor,
      vendorName: "Acme Cloud",
      projectIds: [project],
    };

    expect((await notifyVendorRiskCandidates(input)).notified).toBe(1);
    expect((await notifyVendorRiskCandidates(input)).notified).toBe(0);
    expect(await notificationRows(seed.orgA)).toHaveLength(1);
  });

  it("announces a genuinely new vendor risk once, and only that one", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const { project, vendor } = await vendorInUseCase(seed.orgA, seed.userA);
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, project);
    const base = {
      organizationId: seed.orgA,
      vendorId: vendor,
      vendorName: "Acme Cloud",
      projectIds: [project],
    };
    await notifyVendorRiskCandidates(base);

    const added = await createTestVendorRisk(seed.orgA, { vendor_id: vendor });
    const second = await notifyVendorRiskCandidates({ ...base, vendorRiskIds: [added] });
    const third = await notifyVendorRiskCandidates({ ...base, vendorRiskIds: [added] });

    expect(second).toMatchObject({ risks: 1, candidates: 1, notified: 1 });
    expect(third.notified).toBe(0);
    const rows = await notificationRows(seed.orgA);
    expect(rows).toHaveLength(2);
    expect(rows[1].metadata).toEqual({ vendor_id: vendor, vendor_risk_ids: [added] });
    expect(rows[1].message).toContain("1 vendor risk ");
  });

  it("does not count a soft-deleted vendor risk", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const {
      project,
      vendor,
      vendorRiskIds: [, gone],
    } = await vendorInUseCase(seed.orgA, seed.userA, 2);
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, project);
    await sequelize.query(`UPDATE vendorrisks SET is_deleted = true WHERE id = :gone`, {
      replacements: { gone },
    });

    const summary = await notifyVendorRiskCandidates({
      organizationId: seed.orgA,
      vendorId: vendor,
      vendorName: "Acme Cloud",
      projectIds: [project],
    });

    expect(summary.candidates).toBe(1);
  });

  it("concurrent duplicate notices collapse to one row", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const { project, vendor } = await vendorInUseCase(seed.orgA, seed.userA);
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await linkRiskToProject(seed.orgA, risk, project);

    const riskRef = { id: risk, risk_name: "R", risk_owner: seed.userA };
    const vendorRef = { id: vendor, name: "V" };
    const [a, b] = await Promise.all([
      notifyRiskOfVendorCandidates(seed.orgA, riskRef, vendorRef, 1),
      notifyRiskOfVendorCandidates(seed.orgA, riskRef, vendorRef, 1),
    ]);

    // Exactly one send; the loser is suppressed by the unique index, not an error.
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await notificationRows(seed.orgA)).toHaveLength(1);
  });

  it("never notifies another organization's risks", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const a = await vendorInUseCase(seed.orgA, seed.userA);
    const b = await vendorInUseCase(seed.orgB, seed.userB);
    const riskA = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    const riskB = await createTestRisk(seed.orgB, { risk_owner: seed.userB });
    await linkRiskToProject(seed.orgA, riskA, a.project);
    await linkRiskToProject(seed.orgB, riskB, b.project);

    // Org A's vendor, with org B's project id smuggled in.
    const summary = await notifyVendorRiskCandidates({
      organizationId: seed.orgA,
      vendorId: a.vendor,
      vendorName: "Acme Cloud",
      projectIds: [a.project, b.project],
    });

    expect(summary.notified).toBe(1);
    expect((await notificationRows(seed.orgA)).map((row) => row.entity_id)).toEqual([riskA]);
    expect(await notificationRows(seed.orgB)).toHaveLength(0);
  });
});
