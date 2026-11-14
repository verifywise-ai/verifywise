jest.setTimeout(60000);

jest.mock("../../../utils/aiGatewayInternal.utils", () => ({
  aiGatewayRequest: jest.fn().mockResolvedValue({ summary: { blocked: 0, masked: 0 } }),
}));

import { sequelize } from "../../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "../helpers";
import {
  assignTaskToUser,
  createTestProject,
  createTestTask,
} from "../../factories/test-entities.factory";
import {
  dayOffset,
  seedAgent,
  seedAiApp,
  seedIncident,
  seedMrmFinding,
  seedPendingApproval,
  seedPendingIntake,
  seedPolicy,
  seedRisk,
  seedVendor,
  utcToday,
} from "../../factories/home-queue.factory";
import { getHomeQueue } from "../../../services/homeQueue";
import type { HomeQueueContext } from "../../../domain.layer/interfaces/i.homeQueue";

/**
 * Home queue tenant isolation (`GET /api/v1/home/queue`). One person belongs to
 * two organizations and has work waiting in both; the queue for org A must
 * hold nothing of org B's, in its items and in its org-wide counts, and the
 * reverse. Org B is seeded with more of everything, with different counts, so
 * a leak shows as a wrong number as well as a foreign name.
 */

const ctxFor = (organizationId: number, userId: number): HomeQueueContext => ({
  organizationId,
  userId,
  can: () => true,
  isAdmin: true,
  today: utcToday(),
});

/** Seeds `n` of every kind of item for the person in `orgId`, named `${label} <kind> <i>`. */
async function seedOrg(orgId: number, me: number, label: string, n: number): Promise<void> {
  const name = (kind: string, i: number) => `${label} ${kind} ${i}`;
  for (let i = 1; i <= n; i++) {
    const taskId = await createTestTask(orgId, { title: name("task", i) });
    await assignTaskToUser(orgId, taskId, me);
    await seedRisk(orgId, { name: name("risk", i), ownerId: me, mitigationStatus: "Not Started" });
    await seedPolicy(orgId, {
      title: name("policy", i),
      ownerId: me,
      nextReviewDate: dayOffset(-1),
    });
    await seedVendor(orgId, {
      name: name("vendor", i),
      reviewerId: me,
      reviewDate: dayOffset(-1),
      reviewStatus: "In review",
    });
    await seedIncident(orgId, { assigneeId: me, aiProject: name("incident", i) });
    await seedMrmFinding(orgId, { title: name("finding", i), ownerId: me });
    await seedPendingApproval(orgId, {
      name: name("approval", i),
      requestedBy: me,
      approverId: me,
    });
    await seedPendingIntake(orgId, { slug: `${label}-intake-${i}`, createdBy: me });
    await createTestProject(orgId, me, { project_title: name("use case", i) });
    await seedAiApp(orgId, name("app", i));
    await seedAgent(orgId, `${label}-agent-${i}`);
  }
}

describe("Home queue tenant isolation", () => {
  let orgA: number;
  let orgB: number;
  let me: number;

  beforeEach(async () => {
    const suffix = Date.now();
    orgA = await createTestOrganization(`Home A ${suffix}`);
    orgB = await createTestOrganization(`Home B ${suffix}`);
    me = await createTestUser(orgA, 1, `home-multi-${suffix}@test.com`, "HomeQueue1!");
    await sequelize.query(
      `INSERT INTO organization_members (organization_id, user_id, role_id) VALUES (:orgB, :me, 1)`,
      { replacements: { orgB, me } },
    );
    await seedOrg(orgA, me, "alpha", 1);
    await seedOrg(orgB, me, "bravo", 2);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("gives org A's queue only org A's items, from every source", async () => {
    const queue = await getHomeQueue(ctxFor(orgA, me));

    const sources = new Set(queue.items.map((i) => i.source));
    expect([...sources].sort()).toEqual(
      [
        "approvals",
        "incidents",
        "intake",
        "mrmFindings",
        "policyReviews",
        "risks",
        "tasks",
        "vendorReviews",
      ].sort(),
    );
    expect(queue.items.map((i) => i.name).filter((n) => n.startsWith("bravo"))).toEqual([]);
    for (const source of sources) {
      expect(queue.items.filter((i) => i.source === source)).toHaveLength(1);
    }
  });

  it("gives org B's queue only org B's items", async () => {
    const queue = await getHomeQueue(ctxFor(orgB, me));

    expect(queue.items.map((i) => i.name).filter((n) => n.startsWith("alpha"))).toEqual([]);
    for (const source of Object.values(queue.sources)) {
      expect(source?.status).toBe("ok");
      expect(source?.count).toBe(2);
    }
  });

  it("counts only the caller's organization, read from the real tables", async () => {
    const a = (await getHomeQueue(ctxFor(orgA, me))).counts;
    const b = (await getHomeQueue(ctxFor(orgB, me))).counts;

    expect(a).toEqual({
      intakeWaiting: 1,
      agentsToReview: 1,
      // use case + model (one per finding) + AI app + agent
      aiOnRecord: 4,
      untreatedRisks: 1,
      vendorReviewsDue: 1,
      policyReviewsDue: 1,
      promptsBlockedMasked24h: 0,
    });
    expect(b).toEqual({
      intakeWaiting: 2,
      agentsToReview: 2,
      aiOnRecord: 8,
      untreatedRisks: 2,
      vendorReviewsDue: 2,
      policyReviewsDue: 2,
      promptsBlockedMasked24h: 0,
    });
  });

  it("counts org-wide: a risk or vendor owned by someone else still counts", async () => {
    const colleague = await createTestUser(
      orgA,
      3,
      `home-col-${Date.now()}@test.com`,
      "HomeQueue1!",
    );
    await seedRisk(orgA, { name: "alpha colleague risk", ownerId: colleague });
    await seedVendor(orgA, {
      name: "alpha colleague vendor",
      reviewerId: colleague,
      reviewDate: dayOffset(3),
    });
    await seedPolicy(orgA, {
      title: "alpha colleague policy",
      ownerId: colleague,
      nextReviewDate: dayOffset(3),
    });

    const queue = await getHomeQueue(ctxFor(orgA, me));

    expect(queue.counts.untreatedRisks).toBe(2);
    expect(queue.counts.vendorReviewsDue).toBe(2);
    expect(queue.counts.policyReviewsDue).toBe(2);
    expect(queue.items.map((i) => i.name)).not.toContain("alpha colleague risk");
  });
});
