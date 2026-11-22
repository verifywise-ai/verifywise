jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

/**
 * Incident create and update check their references (linked use case,
 * affected model, owner) on their own transaction with locking reads, taken in
 * the same order the deleters take theirs. A reference deleted, or an owner
 * removed, by another transaction that has not committed yet makes the write
 * wait for it and then answer the usual 400, instead of passing the check and
 * failing the write (500) or saving a non-member owner. A deletion that starts
 * after the check waits for the write instead; neither side deadlocks.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestUser } from "./helpers";
import { seedTwoTenantContexts, TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestIncident, createTestProject } from "../factories";
import { deleteUserAccountQuery } from "../../utils/user.utils";
import {
  createNewIncidentQuery,
  validateIncidentReferences,
} from "../../utils/incidentManagement.utils";
import { AIIncidentManagementModel } from "../../domain.layer/models/incidentManagement/incidemtManagement.model";

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
 * True once a backend running a statement that matches `pattern` waits on a
 * lock in this database; false if `pending` settles first or 10s pass.
 */
async function sawLockWait(pending: Promise<unknown>, pattern: string): Promise<boolean> {
  let settled = false;
  pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  const deadline = Date.now() + 10000;
  while (!settled && Date.now() < deadline) {
    const [{ waiting }] = (await sequelize.query(
      `SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query ILIKE :pattern`,
      { replacements: { pattern }, type: QueryTypes.SELECT },
    )) as { waiting: number }[];
    if (waiting > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function incidentCount(): Promise<number> {
  const [{ count }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM ai_incident_managements`,
    { type: QueryTypes.SELECT },
  )) as { count: number }[];
  return count;
}

const invalidReference = (field: string) => [
  {
    field,
    message: `${field} does not reference an entity in your organization`,
    code: "INVALID_REFERENCE",
  },
];

/** A member of `owner`'s organization who also belongs to `other`'s, so removing one membership leaves a valid account. */
async function seedSecondMember(owner: TenantContext, other: TenantContext): Promise<number> {
  const memberId = await createTestUser(
    owner.orgId,
    3,
    `incident-owner-${Date.now()}@test.com`,
    "Password123!",
  );
  await sequelize.query(
    `INSERT INTO organization_members (organization_id, user_id, role_id) VALUES (:orgId, :memberId, 3)`,
    { replacements: { orgId: other.orgId, memberId } },
  );
  return memberId;
}

describe("incident writes check their references inside their transaction", () => {
  const open: Transaction[] = [];
  const begin = async () => {
    const t = await sequelize.transaction();
    open.push(t);
    return t;
  };
  const finish = async (t: Transaction) => {
    await t.commit();
    open.splice(open.indexOf(t), 1);
  };

  afterEach(async () => {
    for (const t of open.splice(0)) await t.rollback().catch(() => undefined);
    await cleanupDatabase();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("create", () => {
    it("answers 400 when the linked use case is deleted by a transaction still open", async () => {
      const { owner } = await seedTwoTenantContexts();
      const projectId = await createTestProject(owner.orgId, owner.userId);

      const other = await begin();
      await sequelize.query(`DELETE FROM projects WHERE id = :projectId`, {
        replacements: { projectId },
        transaction: other,
      });

      const response = owner.request
        .post(ROUTE)
        .send(payload({ project_id: projectId }))
        .then((res) => res);
      expect(await sawLockWait(response, "%FROM projects%FOR KEY SHARE%")).toBe(true);
      await finish(other);

      const res = await response;
      expect(res.status).toBe(400);
      expect(res.body?.data?.message).toBe("Incident creation validation failed");
      expect(res.body?.data?.errors).toEqual(invalidReference("project_id"));
      expect(await incidentCount()).toBe(0);
    });

    it("answers 400 when the owner is removed from the organization by a transaction still open", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const memberId = await seedSecondMember(owner, attacker);

      const other = await begin();
      await sequelize.query(
        `DELETE FROM organization_members WHERE organization_id = :orgId AND user_id = :memberId`,
        { replacements: { orgId: owner.orgId, memberId }, transaction: other },
      );

      const response = owner.request
        .post(ROUTE)
        .send(payload({ assignee_id: memberId }))
        .then((res) => res);
      expect(await sawLockWait(response, "%FROM organization_members%FOR KEY SHARE%")).toBe(true);
      await finish(other);

      const res = await response;
      expect(res.status).toBe(400);
      expect(res.body?.data?.errors).toEqual(invalidReference("assignee_id"));
      expect(await incidentCount()).toBe(0);
    });

    it("answers 400 when the owner's account is deleted by a transaction still open", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const memberId = await seedSecondMember(owner, attacker);

      const other = await begin();
      await deleteUserAccountQuery(memberId, other);

      const response = owner.request
        .post(ROUTE)
        .send(payload({ assignee_id: memberId }))
        .then((res) => res);
      expect(await sawLockWait(response, "%FROM users%FOR KEY SHARE%")).toBe(true);
      await finish(other);

      const res = await response;
      expect(res.status).toBe(400);
      expect(res.body?.data?.errors).toEqual(invalidReference("assignee_id"));
      expect(await incidentCount()).toBe(0);
    });

    it("makes an account deletion that starts after the check wait, without a deadlock", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const memberId = await seedSecondMember(owner, attacker);

      // The create path, step by step: check, then (while the deletion waits) insert.
      const create = await begin();
      const createLocks = { lock: true, lockOrganization: true };
      await expect(
        validateIncidentReferences({ assignee_id: memberId }, owner.orgId, create, createLocks),
      ).resolves.toEqual([]);

      const deletion = (async () => {
        const t = await begin();
        await deleteUserAccountQuery(memberId, t);
        await finish(t);
      })();
      expect(await sawLockWait(deletion, "%users%")).toBe(true);

      const incident = await createNewIncidentQuery(
        {
          ai_project: "Support chatbot",
          type: "Malfunction",
          severity: "Serious",
          status: "Open",
          approval_status: "Pending",
          description: "The chatbot gave unsafe advice",
          categories_of_harm: [],
          assignee_id: memberId,
        } as unknown as AIIncidentManagementModel,
        owner.orgId,
        create,
      );
      await finish(create);
      await deletion;

      // The deletion went through after the create; the FK cleared the owner.
      const [row] = (await sequelize.query(
        `SELECT assignee_id FROM ai_incident_managements WHERE id = :id`,
        { replacements: { id: incident.id }, type: QueryTypes.SELECT },
      )) as { assignee_id: number | null }[];
      expect(row.assignee_id).toBeNull();
      const users = await sequelize.query(`SELECT id FROM users WHERE id = :memberId`, {
        replacements: { memberId },
        type: QueryTypes.SELECT,
      });
      expect(users).toEqual([]);
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

  describe("update", () => {
    it("answers 400 when the new use case is deleted by a transaction still open", async () => {
      const { owner } = await seedTwoTenantContexts();
      const incidentId = await createTestIncident(owner.orgId, owner.userId);
      const projectId = await createTestProject(owner.orgId, owner.userId);

      const other = await begin();
      await sequelize.query(`DELETE FROM projects WHERE id = :projectId`, {
        replacements: { projectId },
        transaction: other,
      });

      const response = owner.request
        .patch(`${ROUTE}/${incidentId}`)
        .send({ project_id: projectId })
        .then((res) => res);
      expect(await sawLockWait(response, "%FROM projects%FOR KEY SHARE%")).toBe(true);
      await finish(other);

      const res = await response;
      expect(res.status).toBe(400);
      expect(res.body?.data?.errors).toEqual(invalidReference("project_id"));
    });

    it("answers 400 when the new owner is removed from the organization by a transaction still open", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const incidentId = await createTestIncident(owner.orgId, owner.userId);
      const memberId = await seedSecondMember(owner, attacker);

      const other = await begin();
      await sequelize.query(
        `DELETE FROM organization_members WHERE organization_id = :orgId AND user_id = :memberId`,
        { replacements: { orgId: owner.orgId, memberId }, transaction: other },
      );

      const response = owner.request
        .patch(`${ROUTE}/${incidentId}`)
        .send({ assignee_id: memberId })
        .then((res) => res);
      expect(await sawLockWait(response, "%FROM organization_members%FOR KEY SHARE%")).toBe(true);
      await finish(other);

      const res = await response;
      expect(res.status).toBe(400);
      expect(res.body?.data?.errors).toEqual(invalidReference("assignee_id"));
      const [row] = (await sequelize.query(
        `SELECT assignee_id FROM ai_incident_managements WHERE id = :incidentId`,
        { replacements: { incidentId }, type: QueryTypes.SELECT },
      )) as { assignee_id: number | null }[];
      expect(row.assignee_id).toBe(owner.userId);
    });
  });

  it("refuses a locking check without a transaction", async () => {
    await expect(
      validateIncidentReferences({ project_id: 1 }, 1, undefined, { lock: true }),
    ).rejects.toThrow("a locking check needs a transaction");
  });
});
