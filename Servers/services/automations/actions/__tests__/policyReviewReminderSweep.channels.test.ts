/**
 * The sweep with the real notifyPolicyReviewReminder: the in-app notice is the
 * channel of record, so a failed email still stamps the policy and a failed
 * in-app notice leaves it unstamped for the next day's run.
 */
const mockFind = jest.fn();
const mockMark = jest.fn();
const mockCreate = jest.fn();
const mockSendTemplate = jest.fn();

jest.mock("../../../../database/db", () => ({
  sequelize: {
    query: jest.fn().mockResolvedValue([{ name: "Ada", surname: "L", email: "ada@example.com" }]),
  },
}));
jest.mock("../../../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
}));
jest.mock("../../../../utils/policyManager.utils", () => ({
  findPolicyRemindersDueQuery: (...args: unknown[]) => mockFind(...args),
  markPolicyReminderSentQuery: (...args: unknown[]) => mockMark(...args),
}));
jest.mock("../../../../utils/notification.utils", () => ({
  createNotificationQuery: (...args: unknown[]) => mockCreate(...args),
  createBulkNotificationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/userPreference.utils", () => ({
  getUserLanguage: jest.fn().mockResolvedValue("en"),
}));
jest.mock("../../../notificationService", () => ({
  notificationService: {
    sendEmailWithTemplate: (...args: unknown[]) => mockSendTemplate(...args),
  },
}));
jest.mock("../../../slack/slackNotificationService", () => ({
  sendSlackNotification: jest.fn().mockResolvedValue({ attempted: false, delivered: false }),
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { runPolicyReviewReminderSweep } from "../policyReviewReminderSweep";

const due = {
  id: 9,
  title: "AI use policy",
  review_date: "2030-01-15",
  kind: "overdue",
  recipient_ids: [11, 12],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockResolvedValue([due]);
  mockMark.mockResolvedValue(undefined);
  mockCreate.mockResolvedValue({ id: 1 });
  mockSendTemplate.mockResolvedValue(undefined);
});

describe("policy review reminder sweep channels", () => {
  it("stores the in-app notices and stamps the policy when email fails", async () => {
    mockSendTemplate.mockRejectedValue(new Error("EMAIL_ID is not set"));

    const summary = await runPolicyReviewReminderSweep(3);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockMark).toHaveBeenCalledWith(9, "overdue", 3);
    expect(summary).toEqual({ organization_id: 3, candidates: 1, notified: 1 });
  });

  it("leaves the policy unstamped when one in-app notice fails", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error("db down"));

    const summary = await runPolicyReviewReminderSweep(3);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockMark).not.toHaveBeenCalled();
    expect(summary).toEqual({ organization_id: 3, candidates: 1, notified: 0 });
  });
});
