import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn<any>(),
}));
jest.mock("../../../../utils/policyManager.utils", () => ({
  findPolicyRemindersDueQuery: jest.fn<any>(),
  markPolicyReminderSentQuery: jest.fn<any>().mockResolvedValue(true),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyPolicyReviewReminder: jest.fn<any>(),
}));
jest.mock("../../../slack/slackNotificationService", () => ({
  sendSlackNotification: jest.fn<any>(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  runPolicyReviewReminderSweep,
  runPolicyReviewReminderSweepAllOrgs,
} from "../policyReviewReminderSweep";
import {
  findPolicyRemindersDueQuery,
  markPolicyReminderSentQuery,
} from "../../../../utils/policyManager.utils";
import { notifyPolicyReviewReminder } from "../../../inAppNotification.service";
import { sendSlackNotification } from "../../../slack/slackNotificationService";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";
import logger from "../../../../utils/logger/fileLogger";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

const reminder = (id: number, kind: "due_soon" | "overdue", recipients = [id + 100]) => ({
  id,
  title: `Policy ${id}`,
  review_date: "2030-01-15",
  kind,
  recipient_ids: recipients,
});

beforeEach(() => {
  jest.clearAllMocks();
  m(notifyPolicyReviewReminder).mockResolvedValue(undefined);
  m(sendSlackNotification).mockResolvedValue({ attempted: false, delivered: false });
  m(markPolicyReminderSentQuery).mockResolvedValue(true);
});

describe("runPolicyReviewReminderSweep", () => {
  it("notifies every recipient with the kind and stamps that kind once per policy", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([
      reminder(1, "due_soon", [11, 12]),
      reminder(2, "overdue", [13]),
    ]);

    const summary = await runPolicyReviewReminderSweep(3);

    expect(m(notifyPolicyReviewReminder).mock.calls.map((c: any[]) => [c[1], c[3]])).toEqual([
      [11, "due_soon"],
      [12, "due_soon"],
      [13, "overdue"],
    ]);
    expect(m(notifyPolicyReviewReminder).mock.calls[0]).toEqual([
      3,
      11,
      { id: 1, title: "Policy 1", reviewDate: "2030-01-15" },
      "due_soon",
      expect.any(String),
    ]);
    expect(markPolicyReminderSentQuery).toHaveBeenCalledTimes(2);
    expect(markPolicyReminderSentQuery).toHaveBeenCalledWith(1, "due_soon", "2030-01-15", 3);
    expect(markPolicyReminderSentQuery).toHaveBeenCalledWith(2, "overdue", "2030-01-15", 3);
    expect(summary).toEqual({ organization_id: 3, candidates: 2, notified: 2 });
  });

  it("sends each recipient the Slack message on the policy reminders route", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([reminder(1, "overdue", [11, 12])]);

    await runPolicyReviewReminderSweep(3);

    expect(sendSlackNotification).toHaveBeenCalledTimes(2);
    expect(sendSlackNotification).toHaveBeenCalledWith(
      { userId: 11, routingType: "Policy reminders and status" },
      {
        title: "Policy review reminder",
        message: 'The review of policy "Policy 1" was due on January 15, 2030.',
      },
    );
    expect(m(sendSlackNotification).mock.calls[1][0].userId).toBe(12);
  });

  it("stamps a policy when one of three in-app notices fails, and logs that one", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([reminder(1, "overdue", [11, 12, 13])]);
    m(notifyPolicyReviewReminder)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("in-app store failed"))
      .mockResolvedValueOnce(undefined);

    const summary = await runPolicyReviewReminderSweep(3);

    expect(notifyPolicyReviewReminder).toHaveBeenCalledTimes(3);
    expect(markPolicyReminderSentQuery).toHaveBeenCalledWith(1, "overdue", "2030-01-15", 3);
    expect(summary).toEqual({ organization_id: 3, candidates: 1, notified: 1 });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("policy 1, user 12"),
      expect.any(Error),
    );
  });

  it("leaves a policy unstamped when no recipient was reached, and goes on", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([
      reminder(1, "overdue", [11, 12]),
      reminder(2, "due_soon", [14]),
    ]);
    m(notifyPolicyReviewReminder)
      .mockRejectedValueOnce(new Error("in-app store failed"))
      .mockRejectedValueOnce(new Error("in-app store failed"))
      .mockResolvedValueOnce(undefined);

    const summary = await runPolicyReviewReminderSweep(3);

    expect(markPolicyReminderSentQuery).toHaveBeenCalledTimes(1);
    expect(markPolicyReminderSentQuery).toHaveBeenCalledWith(2, "due_soon", "2030-01-15", 3);
    expect(summary).toEqual({ organization_id: 3, candidates: 2, notified: 1 });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("does not count a policy whose review date changed before the stamp", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([reminder(1, "due_soon")]);
    m(markPolicyReminderSentQuery).mockResolvedValue(false);

    const summary = await runPolicyReviewReminderSweep(3);

    expect(summary.notified).toBe(0);
  });

  it("still stamps when Slack fails", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([reminder(1, "due_soon", [11])]);
    m(sendSlackNotification).mockRejectedValue(new Error("slack down"));

    const summary = await runPolicyReviewReminderSweep(3);

    expect(markPolicyReminderSentQuery).toHaveBeenCalledWith(1, "due_soon", "2030-01-15", 3);
    expect(summary.notified).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("slack down"));
  });

  it("goes on with the next policy when a stamp fails", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([
      reminder(1, "due_soon"),
      reminder(2, "due_soon"),
    ]);
    m(markPolicyReminderSentQuery)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(true);

    const summary = await runPolicyReviewReminderSweep(3);

    expect(markPolicyReminderSentQuery).toHaveBeenCalledTimes(2);
    expect(summary.notified).toBe(1);
  });

  it("does nothing when no policy is due", async () => {
    m(findPolicyRemindersDueQuery).mockResolvedValue([]);

    const summary = await runPolicyReviewReminderSweep(3);

    expect(notifyPolicyReviewReminder).not.toHaveBeenCalled();
    expect(summary).toEqual({ organization_id: 3, candidates: 0, notified: 0 });
  });
});

describe("runPolicyReviewReminderSweepAllOrgs", () => {
  it("runs every organization and goes on after one fails", async () => {
    m(getAllOrganizationsQuery).mockResolvedValue([{ id: 1 }, { id: null }, { id: 2 }]);
    m(findPolicyRemindersDueQuery)
      .mockRejectedValueOnce(new Error("org 1 broken"))
      .mockResolvedValueOnce([reminder(5, "overdue")]);

    await runPolicyReviewReminderSweepAllOrgs();

    expect(findPolicyRemindersDueQuery).toHaveBeenCalledTimes(2);
    expect(findPolicyRemindersDueQuery).toHaveBeenNthCalledWith(1, 1);
    expect(findPolicyRemindersDueQuery).toHaveBeenNthCalledWith(2, 2);
    expect(markPolicyReminderSentQuery).toHaveBeenCalledWith(5, "overdue", "2030-01-15", 2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("org 1"), expect.any(Error));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("org 2: candidates=1"));
  });
});
