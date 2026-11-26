import {
  runDeadlineEscalationSweep,
  runDeadlineEscalationSweepAllOrgs,
  DEADLINE_EMAIL_DAYS,
  DEADLINE_SLACK_DAYS,
} from "../deadlineEscalationSweep";
import {
  getRisksApproachingDeadlineQuery,
  getModelRisksApproachingTargetDateQuery,
  hasDeadlineNoticeQuery,
  getDeadlineAdminIdsQuery,
  DeadlineEscalationRow,
} from "../../../../utils/deadline.utils";
import {
  notifyRiskDeadlineDueSoon,
  notifyModelRiskDueSoon,
} from "../../../inAppNotification.service";
import { sendDeadlineDueSoonSlackNotification } from "../../../slack/deadlineDueSoonNotification";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";

jest.mock("../../../../utils/deadline.utils", () => ({
  getRisksApproachingDeadlineQuery: jest.fn(),
  getModelRisksApproachingTargetDateQuery: jest.fn(),
  hasDeadlineNoticeQuery: jest.fn(),
  getDeadlineAdminIdsQuery: jest.fn(),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyRiskDeadlineDueSoon: jest.fn(),
  notifyModelRiskDueSoon: jest.fn(),
}));
jest.mock("../../../slack/deadlineDueSoonNotification", () => ({
  sendDeadlineDueSoonSlackNotification: jest.fn(),
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockRisks = getRisksApproachingDeadlineQuery as jest.Mock;
const mockModelRisks = getModelRisksApproachingTargetDateQuery as jest.Mock;
const mockDedup = hasDeadlineNoticeQuery as jest.Mock;
const mockAdmins = getDeadlineAdminIdsQuery as jest.Mock;
const mockEmailRisk = notifyRiskDeadlineDueSoon as jest.Mock;
const mockEmailModelRisk = notifyModelRiskDueSoon as jest.Mock;
const mockSlack = sendDeadlineDueSoonSlackNotification as jest.Mock;
const mockOrgs = getAllOrganizationsQuery as jest.Mock;

// A fixed address, so the expected links do not come from the helper under test.
const BASE_URL = "https://vw.test";
const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
beforeAll(() => {
  process.env.FRONTEND_URL = BASE_URL;
});
afterAll(() => {
  if (ORIGINAL_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
});
const DAY = 86400000;

const riskRow = (overrides: Partial<DeadlineEscalationRow> = {}): DeadlineEscalationRow => ({
  entity_id: 31,
  entity_name: "Risk R",
  deadline: new Date(Date.now() + 7 * DAY),
  owner_id: 5,
  ...overrides,
});

/** Nothing due on either leg by default; each test opens what it needs. */
const quietQueries = () => {
  mockRisks.mockResolvedValue([]);
  mockModelRisks.mockResolvedValue([]);
};

beforeEach(() => {
  jest.clearAllMocks();
  quietQueries();
  mockAdmins.mockResolvedValue([9]);
  mockDedup.mockResolvedValue(false);
  mockEmailRisk.mockResolvedValue(undefined);
  mockEmailModelRisk.mockResolvedValue(undefined);
  mockSlack.mockResolvedValue({ attempted: true, delivered: true });
});

describe("runDeadlineEscalationSweep", () => {
  it("a risk 7 days out with no prior notice → email once, no Slack", async () => {
    const row = riskRow();
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_EMAIL_DAYS ? [row] : [],
    );

    const summary = await runDeadlineEscalationSweep(1);

    // Owner + the one admin, one notice each.
    expect(mockEmailRisk).toHaveBeenCalledTimes(2);
    expect(mockEmailRisk).toHaveBeenCalledWith(
      1,
      5,
      { id: 31, name: "Risk R", deadline: row.deadline },
      DEADLINE_EMAIL_DAYS,
      BASE_URL,
      true,
    );
    expect(mockSlack).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, emailed: 2, slacked: 0 });
  });

  it("a risk 1 day out → Slack, with the 7-day notice tracked independently", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockResolvedValue([row]);

    const summary = await runDeadlineEscalationSweep(1);

    // Owner and admin each get their own connections; the organization's
    // connections get one post for the row, not one per recipient.
    expect(mockSlack).toHaveBeenCalledTimes(3);
    expect(mockSlack.mock.calls.map((call) => call[1]).sort()).toEqual([5, 9, null].sort());
    expect(mockSlack.mock.calls.filter((call) => call[1] === null)).toHaveLength(1);
    // Each send names the swept organization, never the recipient's other ones.
    for (const call of mockSlack.mock.calls) expect(call[0]).toBe(1);
    // The 7-day leg fired too (1 day out is within 7), under its own dedup row.
    expect(mockDedup).toHaveBeenCalledWith(
      1,
      5,
      "risk_deadline_due_soon",
      "risk",
      31,
      DEADLINE_EMAIL_DAYS,
      row.deadline,
    );
    expect(mockDedup).toHaveBeenCalledWith(
      1,
      5,
      "risk_deadline_due_soon",
      "risk",
      31,
      DEADLINE_SLACK_DAYS,
      row.deadline,
    );
    expect(mockEmailRisk).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({ id: 31 }),
      DEADLINE_EMAIL_DAYS,
      BASE_URL,
      true,
    );
    // The 1-day leg still writes its in-app dedup record, without email.
    expect(mockEmailRisk).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({ id: 31 }),
      DEADLINE_SLACK_DAYS,
      BASE_URL,
      false,
    );
    // Row seen by both legs; each leg notifies owner + admin. Every Slack send
    // delivered (two own, one organization), so all three count.
    expect(summary).toEqual({ scanned: 2, emailed: 2, slacked: 3 });
  });

  it("a row everyone was already told about → no organization post", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockResolvedValue([row]);
    mockDedup.mockResolvedValue(true);

    const summary = await runDeadlineEscalationSweep(1);

    expect(mockSlack).not.toHaveBeenCalled();
    expect(summary.slacked).toBe(0);
  });

  it("first night → exactly one organization post", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_SLACK_DAYS ? [row] : [],
    );

    await runDeadlineEscalationSweep(1);

    expect(mockSlack.mock.calls.filter((call) => call[1] === null)).toHaveLength(1);
  });

  it("one recipient new, one already told → no organization post", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_SLACK_DAYS ? [row] : [],
    );
    // Admin 9 already has the notice; owner 5 does not (owner changed, or a
    // retry after a failed write). The channel already heard about this row.
    mockDedup.mockImplementation(async (_org: number, recipientId: number) => recipientId === 9);

    await runDeadlineEscalationSweep(1);

    expect(mockSlack.mock.calls.map((call) => call[1])).toEqual([5]);
  });

  it("new admin joins after the first night → no organization post", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_SLACK_DAYS ? [row] : [],
    );
    // Owner 5 and admin 9 were told on the first night; admin 12 is new.
    mockAdmins.mockResolvedValue([9, 12]);
    mockDedup.mockImplementation(async (_org: number, recipientId: number) => recipientId !== 12);

    await runDeadlineEscalationSweep(1);

    expect(mockSlack.mock.calls.map((call) => call[1])).toEqual([12]);
  });

  it("a recipient whose send throws counts as neither fresh nor already told", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_SLACK_DAYS ? [row] : [],
    );
    // Admin 9's dedup lookup fails; owner 5 is fresh. Still the first run.
    mockDedup.mockImplementation(async (_org: number, recipientId: number) => {
      if (recipientId === 9) throw new Error("db blip");
      return false;
    });

    await runDeadlineEscalationSweep(1);

    expect(mockSlack.mock.calls.map((call) => call[1])).toEqual([5, null]);
  });

  it("a failing organization post is logged and the sweep goes on", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_SLACK_DAYS ? [row] : [],
    );
    mockSlack.mockImplementation(async (_org: number, userId: number | null) => {
      if (userId === null) throw new Error("slack down");
      return { attempted: true, delivered: true };
    });

    const summary = await runDeadlineEscalationSweep(1);

    expect(summary).toEqual({ scanned: 1, emailed: 0, slacked: 2 });
  });

  it("an undelivered Slack still writes the in-app record but counts zero slacked", async () => {
    const row = riskRow({ deadline: new Date(Date.now() + 1 * DAY) });
    mockRisks.mockResolvedValue([row]);
    mockSlack.mockResolvedValue({ attempted: true, delivered: false });

    const summary = await runDeadlineEscalationSweep(1);

    // The durable in-app notice is still written...
    expect(mockEmailRisk).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({ id: 31 }),
      DEADLINE_SLACK_DAYS,
      BASE_URL,
      false,
    );
    // ...but nothing left the building, so the counter stays honest.
    expect(summary.slacked).toBe(0);
  });

  it("a risk with an existing threshold-7 notice → nothing sent", async () => {
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_EMAIL_DAYS ? [riskRow()] : [],
    );
    mockDedup.mockResolvedValue(true);

    const summary = await runDeadlineEscalationSweep(1);

    expect(mockEmailRisk).not.toHaveBeenCalled();
    expect(mockEmailModelRisk).not.toHaveBeenCalled();
    expect(mockSlack).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, emailed: 0, slacked: 0 });
  });

  it("an overdue risk with no prior notice → each recipient notified exactly once", async () => {
    const row = riskRow({ deadline: new Date(Date.now() - 3 * DAY) });
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_EMAIL_DAYS ? [row] : [],
    );

    const summary = await runDeadlineEscalationSweep(1);

    const emailCalls = mockEmailRisk.mock.calls.filter((c) => c[3] === DEADLINE_EMAIL_DAYS);
    expect(emailCalls).toHaveLength(2); // owner + admin, one notice each
    expect(summary.emailed).toBe(2);
  });

  it("a rescheduled deadline → dedup is asked about the NEW deadline, so the notice re-arms", async () => {
    const oldDeadline = new Date(Date.now() + 2 * DAY);
    const newDeadline = new Date(Date.now() + 6 * DAY);
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_EMAIL_DAYS ? [riskRow({ deadline: newDeadline })] : [],
    );
    // Sent-records exist only for the old deadline.
    mockDedup.mockImplementation(
      async (_o: number, _u: number, _t: string, _e: string, _id: number, _th: number, d: Date) =>
        d.getTime() === oldDeadline.getTime(),
    );

    const summary = await runDeadlineEscalationSweep(1);

    expect(mockDedup).toHaveBeenCalledWith(
      1,
      5,
      "risk_deadline_due_soon",
      "risk",
      31,
      DEADLINE_EMAIL_DAYS,
      newDeadline,
    );
    expect(mockEmailRisk).toHaveBeenCalledWith(
      1,
      5,
      { id: 31, name: "Risk R", deadline: newDeadline },
      DEADLINE_EMAIL_DAYS,
      BASE_URL,
      true,
    );
    expect(summary.emailed).toBe(2); // owner + admin, re-notified for the new date
  });

  it("owner null → admins still notified, no crash", async () => {
    mockRisks.mockImplementation(async (_org: number, days: number) =>
      days === DEADLINE_EMAIL_DAYS ? [riskRow({ owner_id: null })] : [],
    );

    const summary = await runDeadlineEscalationSweep(1);

    expect(mockEmailRisk).toHaveBeenCalledTimes(1);
    expect(mockEmailRisk).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({ id: 31 }),
      DEADLINE_EMAIL_DAYS,
      BASE_URL,
      true,
    );
    expect(summary).toEqual({ scanned: 1, emailed: 1, slacked: 0 });
  });

  it("one recipient throwing → next recipient, next row, next org still run", async () => {
    mockOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const rowA = riskRow({ entity_id: 31 });
    const rowB = riskRow({ entity_id: 32, owner_id: 6 });
    mockRisks.mockImplementation(async (org: number, days: number) => {
      if (org === 2) throw new Error("org boom");
      return days === DEADLINE_EMAIL_DAYS ? [rowA, rowB] : [];
    });
    mockEmailRisk.mockImplementation(async (_o: number, user: number) => {
      if (user === 5) throw new Error("delivery boom");
    });

    await expect(runDeadlineEscalationSweepAllOrgs()).resolves.toBeUndefined();

    // Row A: admin 9 ok, owner 5 throws. Row B: admin 9 ok, owner 6 ok.
    expect(mockEmailRisk).toHaveBeenCalledTimes(4);
    const recipients = mockEmailRisk.mock.calls.map((c) => c[1]).sort();
    expect(recipients).toEqual([5, 6, 9, 9]);
  });
});
