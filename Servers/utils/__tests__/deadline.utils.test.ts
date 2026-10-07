jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

import {
  getRisksApproachingDeadlineQuery,
  getModelRisksApproachingTargetDateQuery,
  hasDeadlineNoticeQuery,
  deadlineNoticeKey,
  DEADLINE_OVERDUE_LOOKBACK_DAYS,
} from "../deadline.utils";
import { sequelize } from "../../database/db";

const query = sequelize.query as jest.Mock;

const lastCall = () => {
  const [sql, options] = query.mock.calls[query.mock.calls.length - 1];
  return { sql: String(sql).replace(/\s+/g, " "), replacements: options.replacements };
};

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
});

describe("getRisksApproachingDeadlineQuery", () => {
  it("excludes risks whose mitigation is Completed or Canceled", async () => {
    await getRisksApproachingDeadlineQuery(1, 7);
    const { sql, replacements } = lastCall();
    expect(sql).toContain("mitigation_status::text NOT IN (:closedStatuses)");
    expect(replacements.closedStatuses).toEqual(["Completed", "Canceled"]);
  });

  it("only looks back a bounded window, so long-past deadlines never flood", async () => {
    await getRisksApproachingDeadlineQuery(1, 7);
    const { sql, replacements } = lastCall();
    expect(sql).toContain("deadline >= NOW() - (:lookbackDays || ' days')::interval");
    expect(replacements.lookbackDays).toBe(DEADLINE_OVERDUE_LOOKBACK_DAYS);
    expect(replacements.thresholdDays).toBe(7);
  });
});

describe("getModelRisksApproachingTargetDateQuery", () => {
  it("excludes Resolved and Accepted model risks", async () => {
    await getModelRisksApproachingTargetDateQuery(1, 1);
    const { sql, replacements } = lastCall();
    expect(sql).toContain("status::text NOT IN (:closedStatuses)");
    expect(replacements.closedStatuses).toEqual(["Resolved", "Accepted"]);
  });

  it("bounds the overdue window against naive UTC", async () => {
    await getModelRisksApproachingTargetDateQuery(1, 1);
    const { sql, replacements } = lastCall();
    expect(sql).toContain(
      "target_date >= (NOW() AT TIME ZONE 'UTC') - (:lookbackDays || ' days')::interval",
    );
    expect(replacements.lookbackDays).toBe(DEADLINE_OVERDUE_LOOKBACK_DAYS);
  });
});

describe("hasDeadlineNoticeQuery", () => {
  it("keys the sent-record on the deadline value, so a reschedule re-arms the notice", async () => {
    query.mockResolvedValue([{ notified: false }]);
    const deadline = new Date("2026-11-20T15:00:00Z");

    const notified = await hasDeadlineNoticeQuery(
      1,
      5,
      "risk_deadline_due_soon",
      "risk",
      31,
      7,
      deadline,
    );

    const { sql, replacements } = lastCall();
    expect(notified).toBe(false);
    expect(sql).toContain("metadata->>'deadline' = :deadlineKey");
    expect(replacements.deadlineKey).toBe("2026-11-20T15:00:00.000Z");
    expect(replacements.thresholdDays).toBe(7);
  });
});

describe("deadlineNoticeKey", () => {
  it("is stable for an unchanged deadline and changes on any reschedule", () => {
    expect(deadlineNoticeKey(new Date("2026-11-20T15:00:00Z"))).toBe(
      deadlineNoticeKey(new Date("2026-11-20T15:00:00.000Z")),
    );
    expect(deadlineNoticeKey(new Date("2026-11-20T12:00:00Z"))).not.toBe(
      deadlineNoticeKey(new Date("2026-11-21T12:00:00Z")),
    );
    // Same local date, different time crossing UTC midnight: still a distinct key,
    // and no false match with another deadline that shares a UTC day.
    expect(deadlineNoticeKey(new Date("2026-10-11T00:30:00Z"))).not.toBe(
      deadlineNoticeKey(new Date("2026-10-11T23:00:00Z")),
    );
  });
});
