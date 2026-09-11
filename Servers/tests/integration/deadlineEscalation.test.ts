jest.setTimeout(60000);

// Mock only the Redis transport: the sweep and both notifiers under test are
// REAL, so this file proves actual `notifications` rows are written. The
// integration setup module is deliberately NOT imported — it would replace
// the whole notifier module with stubs. Email delivery fails offline (no
// RESEND_API_KEY) but sendInAppNotification swallows email errors by design,
// after the row is already persisted.
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
  REDIS_URL: "redis://localhost:6379/0",
}));

import { QueryTypes } from "sequelize";
import {
  cleanupDatabase,
  seedTwoOrgsAndUsers,
  createTestUser,
} from "./helpers";
import { sequelize } from "../../database/db";
import { createTestRisk } from "../factories";
import {
  runDeadlineEscalationSweep,
  runDeadlineEscalationSweepAllOrgs,
} from "../../services/automations/actions/deadlineEscalationSweep";

afterEach(async () => {
  await cleanupDatabase();
});

interface NoticeRow {
  user_id: number;
  type: string;
  entity_type: string;
  entity_id: number;
  threshold: string | null;
}

const noticeRows = async (orgId: number): Promise<NoticeRow[]> =>
  (await sequelize.query(
    `SELECT user_id, type, entity_type, entity_id,
            metadata->>'threshold_days' AS threshold
       FROM notifications
      WHERE organization_id = :orgId
      ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as NoticeRow[];

const setDeadlineDaysOut = (riskId: number, days: number) =>
  sequelize.query(
    `UPDATE risks SET deadline = NOW() + (:days || ' days')::interval WHERE id = :riskId`,
    { replacements: { riskId, days } },
  );

describe("deadline escalation sweep", () => {
  it("a risk 7 days out → exactly one row with threshold_days 7", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await setDeadlineDaysOut(risk, 7);

    const summary = await runDeadlineEscalationSweep(seed.orgA);

    // Owner is the admin here: de-duplicated to a single recipient, one row.
    expect(summary).toEqual({ scanned: 1, emailed: 1, slacked: 0 });
    const rows = await noticeRows(seed.orgA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: seed.userA,
      type: "risk_deadline_due_soon",
      entity_type: "risk",
      entity_id: risk,
      threshold: "7",
    });
  });

  it("running the sweep twice → exactly one row per recipient, not two", async () => {
    const seed = await seedTwoOrgsAndUsers();
    // Owner who is NOT an admin: two distinct recipients, so a per-entity
    // dedup bug (one row total) fails this assertion while per-recipient
    // dedup produces exactly two.
    const owner = await createTestUser(seed.orgA, 3, "owner-a@t.com", "x");
    const risk = await createTestRisk(seed.orgA, { risk_owner: owner });
    await setDeadlineDaysOut(risk, 7);

    await runDeadlineEscalationSweep(seed.orgA);
    const second = await runDeadlineEscalationSweep(seed.orgA);

    expect(second).toEqual({ scanned: 1, emailed: 0, slacked: 0 });
    const rows = await noticeRows(seed.orgA);
    expect(rows).toHaveLength(2);
    const byUser = new Map<number, number>();
    for (const row of rows) {
      byUser.set(row.user_id, (byUser.get(row.user_id) ?? 0) + 1);
      expect(row.threshold).toBe("7");
    }
    expect([...byUser.entries()].sort()).toEqual([[seed.userA, 1], [owner, 1]]);
  });

  it("a second org's due risk never notifies org 1's users", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const riskB = await createTestRisk(seed.orgB, { risk_owner: seed.userB });
    await setDeadlineDaysOut(riskB, 7);

    await runDeadlineEscalationSweepAllOrgs();

    expect(await noticeRows(seed.orgA)).toHaveLength(0);
    const rowsB = await noticeRows(seed.orgB);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]).toMatchObject({ user_id: seed.userB, entity_id: riskB });
  });

  it("a risk 30 days out produces no row", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await setDeadlineDaysOut(risk, 30);

    const summary = await runDeadlineEscalationSweep(seed.orgA);

    expect(summary).toEqual({ scanned: 0, emailed: 0, slacked: 0 });
    expect(await noticeRows(seed.orgA)).toHaveLength(0);
  });
});
