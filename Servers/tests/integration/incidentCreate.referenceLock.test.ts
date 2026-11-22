jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

/**
 * Incident create checks its references (linked use case, affected model,
 * owner membership) on its own transaction with locking reads. A reference
 * deleted, or an owner removed, by another transaction that has not committed
 * yet makes the create wait for it and then answer the usual 400, instead of
 * passing the check and failing the insert (500) or saving a non-member owner.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestUser } from "./helpers";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestProject } from "../factories";

const ROUTE = "/api/ai-incident-managements";

const payload = (refs: Record<string, number>) => ({
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  status: "Open",
  occurred_date: "2026-06-23",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  approval_status: "Pending",
  categories_of_harm: ["Safety"],
  description: "The chatbot gave unsafe advice",
  relationship_causality: "Direct cause",
  ...refs,
});

/**
 * Resolves once some backend waits on a lock in this database, or once the
 * request has settled without waiting (the check did not lock), whichever
 * comes first.
 */
async function lockWaitOrSettled(request: Promise<unknown>): Promise<void> {
  let settled = false;
  request.then(
    () => (settled = true),
    () => (settled = true),
  );
  const deadline = Date.now() + 10000;
  while (!settled && Date.now() < deadline) {
    const [{ waiting }] = (await sequelize.query(
      `SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      { type: QueryTypes.SELECT },
    )) as { waiting: number }[];
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function incidentCount(): Promise<number> {
  const [{ count }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM ai_incident_managements`,
    { type: QueryTypes.SELECT },
  )) as { count: number }[];
  return count;
}

describe("incident create checks its references inside its transaction", () => {
  let other: Transaction | null = null;

  afterEach(async () => {
    if (other) await other.rollback().catch(() => undefined);
    other = null;
    await cleanupDatabase();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("answers 400 when the linked use case is deleted by a transaction still open", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);

    other = await sequelize.transaction();
    await sequelize.query(`DELETE FROM projects WHERE id = :projectId`, {
      replacements: { projectId },
      transaction: other,
    });

    const response = owner.request
      .post(ROUTE)
      .send(payload({ project_id: projectId }))
      .then((res) => res);
    await lockWaitOrSettled(response);
    await other.commit();
    other = null;

    const res = await response;
    expect(res.status).toBe(400);
    expect(res.body?.data?.message).toBe("Incident creation validation failed");
    expect(res.body?.data?.errors).toEqual([
      {
        field: "project_id",
        message: "project_id does not reference an entity in your organization",
        code: "INVALID_REFERENCE",
      },
    ]);
    expect(await incidentCount()).toBe(0);
  });

  it("answers 400 when the owner is removed from the organization by a transaction still open", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const memberId = await createTestUser(
      owner.orgId,
      3,
      `incident-owner-${Date.now()}@test.com`,
      "Password123!",
    );
    // A member elsewhere too, so the removal below leaves them a valid account.
    await sequelize.query(
      `INSERT INTO organization_members (organization_id, user_id, role_id) VALUES (:orgId, :memberId, 3)`,
      { replacements: { orgId: attacker.orgId, memberId } },
    );

    other = await sequelize.transaction();
    await sequelize.query(
      `DELETE FROM organization_members WHERE organization_id = :orgId AND user_id = :memberId`,
      { replacements: { orgId: owner.orgId, memberId }, transaction: other },
    );

    const response = owner.request
      .post(ROUTE)
      .send(payload({ assignee_id: memberId }))
      .then((res) => res);
    await lockWaitOrSettled(response);
    await other.commit();
    other = null;

    const res = await response;
    expect(res.status).toBe(400);
    expect(res.body?.data?.errors).toEqual([
      {
        field: "assignee_id",
        message: "assignee_id does not reference an entity in your organization",
        code: "INVALID_REFERENCE",
      },
    ]);
    expect(await incidentCount()).toBe(0);
  });

  it("still creates an incident whose references are all valid", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);

    const res = await owner.request
      .post(ROUTE)
      .send(payload({ project_id: projectId, assignee_id: owner.userId }));

    expect(res.status).toBe(201);
    expect(res.body?.data?.project_id).toBe(projectId);
    expect(res.body?.data?.assignee_id).toBe(owner.userId);
  });
});
