const mockQuery = jest.fn();
jest.mock("../../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({ logStructuredError: jest.fn() }));
jest.mock("../../../utils/organization.utils", () => ({ getAllOrganizationsQuery: jest.fn() }));
jest.mock("../../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../automationProducer", () => ({ enqueueAutomationAction: jest.fn() }));
jest.mock("../../inAppNotification.service", () => ({ notifyVendorReviewDue: jest.fn() }));

import {
  REMINDER_ACTIONS_SQL,
  VENDORS_DUE_ON_SQL,
  daysBefore,
  sendVendorReviewDateNotification,
} from "../vendorReviewReminders";
import { VENDOR_REVIEW_OPEN_CONDITION } from "../../homeQueue/sources/vendorReviews.source";
import { formatVendorReviewDate } from "../../../utils/automation/vendor.automation.utils";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import { enqueueAutomationAction } from "../automationProducer";
import { notifyVendorReviewDue } from "../../inAppNotification.service";
import { logStructuredError } from "../../../utils/logger/fileLogger";

const orgs = getAllOrganizationsQuery as jest.Mock;
const byId = getVendorByIdQuery as jest.Mock;
const logged = logStructuredError as jest.Mock;

/** The organization's vendors, as getVendorByIdQuery returns them. */
const vendorsOf = {
  mockResolvedValue: (list: { id: number }[]) =>
    byId.mockImplementation(async (id: number) => list.find((v) => v.id === id) ?? null),
};
const enqueue = enqueueAutomationAction as jest.Mock;
const notify = notifyVendorReviewDue as jest.Mock;

const vendor = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  vendor_name: `Vendor ${id}`,
  review_date: "2026-11-30T00:00:00.000Z",
  reviewer: 7,
  assignee: 8,
  risk_score: null,
  projects: [],
  ...extra,
});

const action = (
  automationId: number,
  key: string,
  days: unknown,
  subject = "Review {{vendor.name}}",
) => ({
  automation_id: automationId,
  automation_params: { daysBefore: days },
  action_key: key,
  params: { subject, body: "Due {{vendor.review_date}}", to: ["a@example.com"] },
});

/**
 * Answers the sweep's queries per organization: `actions[org]` for the
 * automation lookup, `due[org][reviewDate]` for the vendor lookup.
 */
const answer = (
  actions: Record<number, unknown[]>,
  due: Record<number, Record<string, number[]>> = {},
) =>
  mockQuery.mockImplementation(async (sql: string, opts: any) => {
    const { organizationId, reviewDate } = opts.replacements;
    if (sql === REMINDER_ACTIONS_SQL) return actions[organizationId] ?? [];
    if (sql.includes("FROM users u")) return [{ full_name: "Rae Viewer" }];
    if (sql === VENDORS_DUE_ON_SQL)
      return (due[organizationId]?.[reviewDate] ?? []).map((id) => ({ id }));
    throw new Error(`unexpected query: ${sql}`);
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date("2026-11-23T03:30:00.000Z"));
  orgs.mockResolvedValue([{ id: 1 }]);
});
afterEach(() => jest.useRealTimers());

describe("vendor review reminder sweep", () => {
  it("sends nothing when the organization has no active reminder automation", async () => {
    answer({});

    await sendVendorReviewDateNotification();

    expect(byId).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("looks up the review date from today's UTC day plus the automation's days before", async () => {
    answer({ 1: [action(10, "send_email", 7)] });

    await sendVendorReviewDateNotification();

    const lookup = mockQuery.mock.calls.find(([sql]) => sql === VENDORS_DUE_ON_SQL)!;
    expect(lookup[1].replacements).toMatchObject({
      organizationId: 1,
      today: "2026-11-23",
      reviewDate: "2026-11-30",
    });
  });

  it("runs every action of every matching automation, in order, with its own template", async () => {
    answer(
      {
        1: [
          action(10, "send_email", 7, "First"),
          action(10, "send_slack", 7, "Second"),
          action(11, "send_email", 0, "Today"),
        ],
      },
      { 1: { "2026-11-30": [3], "2026-11-23": [3] } },
    );
    vendorsOf.mockResolvedValue([vendor(3), vendor(4)]);

    await sendVendorReviewDateNotification();

    expect(
      enqueue.mock.calls.map(([key, data]) => [key, data.subject, data.automation_id]),
    ).toEqual([
      ["send_email", "First", 10],
      ["send_slack", "Second", 10],
      ["send_email", "Today", 11],
    ]);
    expect(enqueue.mock.calls[0][1]).toMatchObject({ organizationId: 1, to: ["a@example.com"] });
    // Only due vendors are loaded, each once however many automations match.
    expect(byId.mock.calls).toEqual([[3, 1]]);
  });

  it("fills the template with the vendor and its review date on the UTC day", async () => {
    answer({ 1: [action(10, "send_email", 7)] }, { 1: { "2026-11-30": [3] } });
    vendorsOf.mockResolvedValue([vendor(3)]);

    await sendVendorReviewDateNotification();

    expect(enqueue.mock.calls[0][1]).toMatchObject({
      subject: "Review Vendor 3",
      body: "Due November 30, 2026",
    });
  });

  it("fills in the reviewer's name, looked up within the organization", async () => {
    answer(
      { 1: [action(10, "send_email", 7, "Reviewer {{vendor.reviewer}}")] },
      { 1: { "2026-11-30": [3] } },
    );
    vendorsOf.mockResolvedValue([vendor(3)]);

    await sendVendorReviewDateNotification();

    expect(enqueue.mock.calls[0][1].subject).toBe("Reviewer Rae Viewer");
    const lookup = mockQuery.mock.calls.find(([sql]) => sql.includes("FROM users u"))!;
    expect(lookup[0]).toContain("organization_members");
    expect(lookup[1].replacements).toEqual({ organizationId: 1, reviewer: 7 });
  });

  it("sends the reviewer one in-app notice per vendor, however many automations match", async () => {
    answer(
      { 1: [action(10, "send_email", 7), action(11, "send_email", 7)] },
      { 1: { "2026-11-30": [3] } },
    );
    vendorsOf.mockResolvedValue([vendor(3)]);

    await sendVendorReviewDateNotification();

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      1,
      7,
      expect.objectContaining({
        id: 3,
        reviewDate: "November 30, 2026",
        riskLevel: "Not assessed",
      }),
      expect.any(String),
    );
  });

  it("notifies the assignee when there is no reviewer, and nobody when neither is set", async () => {
    answer({ 1: [action(10, "send_email", 7)] }, { 1: { "2026-11-30": [3, 4] } });
    vendorsOf.mockResolvedValue([
      vendor(3, { reviewer: null }),
      vendor(4, { reviewer: null, assignee: null }),
    ]);

    await sendVendorReviewDateNotification();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBe(8);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("keeps going after an organization fails", async () => {
    orgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    answer({ 2: [action(20, "send_email", 7)] }, { 2: { "2026-11-30": [5] } });
    const answerOrg = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, opts: any) => {
      if (opts.replacements.organizationId === 1) throw new Error("org 1 is broken");
      return answerOrg(sql, opts);
    });
    vendorsOf.mockResolvedValue([vendor(5)]);

    await sendVendorReviewDateNotification();

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("organization 1"),
      expect.any(Error),
      "sendVendorReviewDateNotification",
      "vendorReviewReminders.ts",
    );
    expect(enqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({ organizationId: 2 }),
    );
  });

  it("keeps going after one automation fails", async () => {
    answer(
      { 1: [action(10, "send_email", 7), action(11, "send_slack", 7)] },
      { 1: { "2026-11-30": [3] } },
    );
    vendorsOf.mockResolvedValue([vendor(3)]);
    enqueue.mockRejectedValueOnce(new Error("queue down"));

    await sendVendorReviewDateNotification();

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("automation 10"),
      expect.any(Error),
      "sendVendorReviewDateNotification",
      "vendorReviewReminders.ts",
    );
    expect(enqueue).toHaveBeenLastCalledWith("send_slack", expect.anything());
  });

  it("keeps going to the next vendor after one vendor's action fails", async () => {
    answer({ 1: [action(10, "send_email", 7)] }, { 1: { "2026-11-30": [3, 4] } });
    vendorsOf.mockResolvedValue([vendor(3), vendor(4)]);
    enqueue.mockRejectedValueOnce(new Error("queue down"));

    await sendVendorReviewDateNotification();

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("vendor 3"),
      expect.any(Error),
      "sendVendorReviewDateNotification",
      "vendorReviewReminders.ts",
    );
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls.map((c) => c[2].id)).toEqual([4]);
  });

  it("skips a due vendor that is gone by the time it is loaded", async () => {
    answer({ 1: [action(10, "send_email", 7)] }, { 1: { "2026-11-30": [3, 9] } });
    vendorsOf.mockResolvedValue([vendor(3)]);

    await sendVendorReviewDateNotification();

    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe("reminder rules", () => {
  it("drops vendors by the same review rule as the Home queue", () => {
    expect(VENDORS_DUE_ON_SQL).toContain(VENDOR_REVIEW_OPEN_CONDITION);
    expect(VENDORS_DUE_ON_SQL).toContain("v.review_date IS NOT NULL");
    expect(VENDORS_DUE_ON_SQL).toContain("v.organization_id = :organizationId");
  });

  it.each([
    [7, 7],
    ["3", 3],
    [undefined, 0],
    [-2, 0],
    [3650, 3650],
    [3651, 0],
    [1e9, 0],
    [1.5, 0],
    ["soon", 0],
  ])("reads days before %p as %p", (value, expected) => {
    expect(daysBefore({ daysBefore: value })).toBe(expected);
  });

  it("formats a review date on its UTC day, and an empty one as Not set", () => {
    expect(formatVendorReviewDate("2026-11-30T00:00:00.000Z")).toBe("November 30, 2026");
    expect(formatVendorReviewDate("2026-11-30T23:30:00.000Z")).toBe("November 30, 2026");
    expect(formatVendorReviewDate(null)).toBe("Not set");
    expect(formatVendorReviewDate("not a date")).toBe("Not set");
  });
});
