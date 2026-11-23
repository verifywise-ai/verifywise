jest.setTimeout(60000);

// Mock only the Redis transport and the email send: the sweep and both
// notifiers under test are REAL, so this file proves actual `notifications`
// rows are written. The integration setup module is deliberately NOT
// imported — it would replace the whole notifier module with stubs.
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
  REDIS_URL: "redis://localhost:6379/0",
}));

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedTwoOrgsAndUsers, createTestUser } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestRisk, createTestModelRisk } from "../factories";
import { DEADLINE_OVERDUE_LOOKBACK_DAYS } from "../../utils/deadline.utils";
import { notificationService } from "../../services/notificationService";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import {
  runDeadlineEscalationSweep,
  runDeadlineEscalationSweepAllOrgs,
} from "../../services/automations/actions/deadlineEscalationSweep";

// Email fails at once, as it does with no email provider configured (here and
// in CI), and sendInAppNotification swallows the failure by design, after the
// row is persisted. The real send queue would back off 600 ms × 2^failures, up
// to 9.6 s, between failed sends and keep the failure count in
// .rate-limit-state.json across runs: this file took over 40 s, and over 60 s
// on later runs, almost all of it waiting. The stub also records who the sweep
// tried to email.
const sendEmailWithTemplate = jest
  .spyOn(notificationService, "sendEmailWithTemplate")
  .mockRejectedValue(new Error("Email ID is not set in environment variables"));

/** Addresses the sweep tried to email, in order. */
const emailedTo = (): string[] => sendEmailWithTemplate.mock.calls.map(([to]) => to);

beforeEach(() => {
  sendEmailWithTemplate.mockClear();
});

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
    // The 7-day notice emails too; that send fails, and the row is kept.
    expect(sendEmailWithTemplate).toHaveBeenCalledTimes(1);
    expect(sendEmailWithTemplate).toHaveBeenCalledWith(
      seed.emailA,
      expect.any(String),
      EMAIL_TEMPLATES.RISK_DEADLINE_DUE,
      expect.objectContaining({ entity_kind: "Risk" }),
    );
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
    expect([...byUser.entries()].sort()).toEqual([
      [seed.userA, 1],
      [owner, 1],
    ]);
    expect(emailedTo().sort()).toEqual([seed.emailA, "owner-a@t.com"].sort());
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
    expect(emailedTo()).toEqual([seed.emailB]);
  });

  it("Completed / Canceled risks and Resolved / Accepted model risks are never escalated", async () => {
    const seed = await seedTwoOrgsAndUsers();
    for (const status of ["Completed", "Canceled"]) {
      const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
      await setDeadlineDaysOut(risk, 1);
      await sequelize.query(`UPDATE risks SET mitigation_status = :status WHERE id = :risk`, {
        replacements: { status, risk },
      });
    }
    for (const status of ["Resolved", "Accepted"]) {
      const modelRisk = await createTestModelRisk(seed.orgA, { owner: seed.userA });
      await sequelize.query(
        `UPDATE model_risks
            SET status = :status,
                target_date = (NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day'
          WHERE id = :modelRisk`,
        { replacements: { status, modelRisk } },
      );
    }

    const summary = await runDeadlineEscalationSweep(seed.orgA);

    expect(summary).toEqual({ scanned: 0, emailed: 0, slacked: 0 });
    expect(await noticeRows(seed.orgA)).toHaveLength(0);
    expect(sendEmailWithTemplate).not.toHaveBeenCalled();
  });

  it("a long-past deadline does not flood; a recently overdue one still notifies", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const stale = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await setDeadlineDaysOut(stale, -(DEADLINE_OVERDUE_LOOKBACK_DAYS + 30));
    const recent = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await setDeadlineDaysOut(recent, -3);

    await runDeadlineEscalationSweep(seed.orgA);

    const rows = await noticeRows(seed.orgA);
    expect(rows.every((row) => row.entity_id === recent)).toBe(true);
    expect(rows.map((row) => row.threshold).sort()).toEqual(["1", "7"]);
    // Only the 7-day notice emails; the 1-day notice goes to Slack instead.
    expect(emailedTo()).toEqual([seed.emailA]);
  });

  it("a rescheduled deadline escalates again; an unchanged one does not", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await setDeadlineDaysOut(risk, 7);

    await runDeadlineEscalationSweep(seed.orgA);
    expect(await runDeadlineEscalationSweep(seed.orgA)).toMatchObject({ emailed: 0 });

    // Pushed back by two days: the old 7-day notice does not cover the new date.
    await setDeadlineDaysOut(risk, 5);
    const afterReschedule = await runDeadlineEscalationSweep(seed.orgA);

    expect(afterReschedule).toMatchObject({ emailed: 1 });
    const rows = await noticeRows(seed.orgA);
    expect(rows.filter((row) => row.threshold === "7")).toHaveLength(2);
    expect(emailedTo()).toEqual([seed.emailA, seed.emailA]);
  });

  it("a risk 30 days out produces no row", async () => {
    const seed = await seedTwoOrgsAndUsers();
    const risk = await createTestRisk(seed.orgA, { risk_owner: seed.userA });
    await setDeadlineDaysOut(risk, 30);

    const summary = await runDeadlineEscalationSweep(seed.orgA);

    expect(summary).toEqual({ scanned: 0, emailed: 0, slacked: 0 });
    expect(await noticeRows(seed.orgA)).toHaveLength(0);
    expect(sendEmailWithTemplate).not.toHaveBeenCalled();
  });
});
