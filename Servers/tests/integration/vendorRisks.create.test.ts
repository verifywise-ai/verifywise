jest.setTimeout(60000);

/**
 * POST /api/vendorRisks against the real test database.
 *
 * The create endpoint was covered only by mocked unit tests. This file drives the real route and
 * asserts what lands: the response, the stored row, the framework links and the change history,
 * plus what the controller fires once the transaction has committed. BullMQ and the notification
 * service are mocked by ./setup, so those last assertions prove what is enqueued and who is told,
 * never that a job runs or a mail goes out.
 */

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor } from "../factories";
// Imported after the harness, which loads ./setup: these resolve to the mocks it registers.
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { automationQueue } from "../../services/automations/automationProducer";

const BASE = "/api/vendorRisks";

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(async () => {
  await cleanupDatabase();
});

const RISK = {
  risk_description: "Vendor stores customer PII without encryption",
  impact_description: "Customer data could be exposed in a breach",
  likelihood: "Possible",
  risk_severity: "Major",
  action_plan: "Require encryption at rest",
  risk_level: "High Risk",
};

const payload = (vendorId: number, overrides: Record<string, unknown> = {}) => ({
  vendor_id: vendorId,
  ...RISK,
  action_owner: null,
  ...overrides,
});

const rows = async <T = Record<string, unknown>>(
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<T[]> => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as T[];

/** How many rows the create flow has left in each of its tables for one organization. */
const storedFor = async (orgId: number) => {
  const count = async (table: string): Promise<number> => {
    const [row] = await rows<{ count: string }>(
      `SELECT count(*) AS count FROM ${table} WHERE organization_id = :orgId`,
      { orgId },
    );
    return Number(row.count);
  };
  return {
    risks: await count("vendorrisks"),
    frameworkLinks: await count("frameworks_vendorrisks"),
    history: await count("vendor_risk_change_history"),
  };
};

/** The related-risk recompute jobs queued so far, as [name, data, options]. */
const recomputeJobs = () =>
  (automationQueue.add as jest.Mock).mock.calls.filter(
    ([name]) => name === "vendor_risk_link_recompute",
  );

describe("POST /api/vendorRisks", () => {
  it("answers 201 and stores the risk, stamped with the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });

    const res = await owner.request.post(BASE).send(payload(vendorId));

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Created");
    expect(res.body.data).toMatchObject({
      id: expect.any(Number),
      vendor_id: vendorId,
      ...RISK,
      action_owner: null,
    });

    const stored = await rows("SELECT * FROM vendorrisks WHERE organization_id = :orgId", {
      orgId: owner.orgId,
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: res.body.data.id,
      vendor_id: vendorId,
      ...RISK,
      action_owner: null,
      is_deleted: false,
      is_demo: false,
    });
    expect((await storedFor(attacker.orgId)).risks).toBe(0);
  });

  it("links the requested frameworks to the risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    const frameworkIds = (
      await rows<{ id: number }>("SELECT id FROM frameworks ORDER BY id LIMIT 2")
    ).map((framework) => framework.id);
    expect(frameworkIds).toHaveLength(2);

    const res = await owner.request
      .post(BASE)
      .send(payload(vendorId, { frameworks: frameworkIds }));

    expect(res.status).toBe(201);
    const links = await rows(
      "SELECT framework_id, organization_id FROM frameworks_vendorrisks WHERE vendorrisk_id = :id ORDER BY framework_id",
      { id: res.body.data.id },
    );
    expect(links).toEqual(
      frameworkIds.map((frameworkId) => ({
        framework_id: frameworkId,
        organization_id: owner.orgId,
      })),
    );
  });

  it("records the creation in the change history for the acting user", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    const [user] = await rows<{ name: string; surname: string }>(
      "SELECT name, surname FROM users WHERE id = :id",
      { id: owner.userId },
    );

    const res = await owner.request
      .post(BASE)
      .send(payload(vendorId, { action_owner: owner.userId }));

    expect(res.status).toBe(201);
    const history = await rows<{ action: string; new_value: string }>(
      "SELECT action, new_value, changed_by_user_id, organization_id FROM vendor_risk_change_history WHERE vendor_risk_id = :id",
      { id: res.body.data.id },
    );
    expect(history.length).toBeGreaterThan(0);
    for (const entry of history) {
      expect(entry).toMatchObject({
        action: "created",
        changed_by_user_id: owner.userId,
        organization_id: owner.orgId,
      });
    }
    // The entries carry the values the risk was created with, the action owner by name.
    expect(history.map((entry) => entry.new_value)).toEqual(
      expect.arrayContaining([
        RISK.risk_description,
        RISK.impact_description,
        RISK.likelihood,
        RISK.risk_severity,
        RISK.action_plan,
        RISK.risk_level,
        `${user.name} ${user.surname}`,
      ]),
    );
  });

  it("enqueues the related-risk recompute and notifies the action owner", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    const [user] = await rows<{ name: string; surname: string }>(
      "SELECT name, surname FROM users WHERE id = :id",
      { id: owner.userId },
    );
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    const res = await owner.request
      .post(BASE)
      .send(payload(vendorId, { action_owner: owner.userId }));

    expect(res.status).toBe(201);
    const riskId = res.body.data.id;
    expect(recomputeJobs()).toEqual([
      [
        "vendor_risk_link_recompute",
        { organizationId: owner.orgId, vendorRiskId: riskId },
        expect.objectContaining({ jobId: `vendor-risk-link:${owner.orgId}:${riskId}` }),
      ],
    ]);
    expect(notifyUserAssigned).toHaveBeenCalledTimes(1);
    expect(notifyUserAssigned).toHaveBeenCalledWith(
      owner.orgId,
      owner.userId,
      {
        entityType: "Vendor Risk",
        entityId: riskId,
        entityName: RISK.risk_description,
        roleType: "Action Owner",
        entityUrl: `${baseUrl}/vendors?vendorRiskId=${riskId}`,
      },
      `${user.name} ${user.surname}`,
      baseUrl,
      { parentType: "Vendor", parentName: "Acme Corp", description: RISK.impact_description },
    );
  });

  it("notifies nobody, and still enqueues the recompute, when no action owner is set", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });

    const res = await owner.request.post(BASE).send(payload(vendorId));

    expect(res.status).toBe(201);
    expect(notifyUserAssigned).not.toHaveBeenCalled();
    expect(recomputeJobs()).toHaveLength(1);
    expect(recomputeJobs()[0][1]).toEqual({
      organizationId: owner.orgId,
      vendorRiskId: res.body.data.id,
    });
    expect((await storedFor(owner.orgId)).frameworkLinks).toBe(0);
  });

  it("answers 500 and stores nothing when the insert fails", async () => {
    const { owner } = await seedTwoTenantContexts();
    const unknownVendorId = 987654321;

    const res = await owner.request
      .post(BASE)
      .send(payload(unknownVendorId, { action_owner: owner.userId }));

    expect(res.status).toBe(500);
    expect(await storedFor(owner.orgId)).toEqual({ risks: 0, frameworkLinks: 0, history: 0 });
    expect(recomputeJobs()).toHaveLength(0);
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  // A failed framework link aborts the whole Postgres transaction, whatever the service catches,
  // so the change history insert that follows fails too: the request answers 500 and nothing is
  // kept. The controller behaved the same way before the creation logic moved into a service.
  it("answers 500 and stores nothing when a framework id does not exist", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });

    const res = await owner.request
      .post(BASE)
      .send(payload(vendorId, { action_owner: owner.userId, frameworks: [987654321] }));

    expect(res.status).toBe(500);
    expect(await storedFor(owner.orgId)).toEqual({ risks: 0, frameworkLinks: 0, history: 0 });
    expect(recomputeJobs()).toHaveLength(0);
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });
});
