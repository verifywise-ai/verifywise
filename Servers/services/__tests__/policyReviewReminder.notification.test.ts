/**
 * notifyPolicyReviewReminder (P-H3, P-M2): the in-app notice is the channel
 * of record and is stored first; the email is best-effort. Both are keyed
 * into the recipient's language. Rejects only when the in-app notice fails.
 */
const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockLanguage = jest.fn();
const mockSendTemplate = jest.fn();

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/notification.utils", () => ({
  createNotificationQuery: (...args: unknown[]) => mockCreate(...args),
  createBulkNotificationsQuery: jest.fn(),
}));
jest.mock("../../utils/userPreference.utils", () => ({
  getUserLanguage: (...args: unknown[]) => mockLanguage(...args),
}));
jest.mock("../notificationService", () => ({
  notificationService: {
    sendEmailWithTemplate: (...args: unknown[]) => mockSendTemplate(...args),
  },
}));

import { notifyPolicyReviewReminder } from "../inAppNotification.service";
import logger from "../../utils/logger/fileLogger";
import { getTranslator } from "../../utils/i18n.utils";

const de = getTranslator("de");
const BASE_URL = "https://app.example.com";
const policy = { id: 9, title: "AI use policy", reviewDate: "2030-01-15" };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([{ name: "Ada", surname: "L", email: "ada@example.com" }]);
  mockCreate.mockResolvedValue({ id: 1 });
  mockSendTemplate.mockResolvedValue(undefined);
  mockLanguage.mockResolvedValue("en");
});

describe("notifyPolicyReviewReminder", () => {
  it.each([
    [
      "due_soon",
      "policy_due_soon",
      "Policy review due soon",
      'The review of policy "AI use policy" is due on January 15, 2030.',
      'The review of policy "AI use policy" is due on January 15, 2030.',
    ],
    [
      "overdue",
      "policy_overdue",
      "Policy review overdue",
      'The review of policy "AI use policy" was due on January 15, 2030. Please review it as soon as you can.',
      'The review of policy "AI use policy" was due on January 15, 2030. Please review it as soon as you can.',
    ],
  ] as const)(
    "sends the %s reminder as %s, in-app then email",
    async (kind, type, title, inAppMessage, emailMessage) => {
      await notifyPolicyReviewReminder(3, 11, policy, kind, BASE_URL);

      expect(mockSendTemplate).toHaveBeenCalledWith(
        "ada@example.com",
        `${title}: AI use policy`,
        "policy-review-reminder.mjml",
        {
          reminder_title: title,
          reminder_message: emailMessage,
          recipient_name: "Ada",
          policy_name: "AI use policy",
          review_date: "January 15, 2030",
          policy_url: `${BASE_URL}/policies/9/edit`,
        },
      );
      expect(mockCreate.mock.calls[0][0]).toMatchObject({
        user_id: 11,
        type,
        title,
        message: inAppMessage,
        entity_type: "policy",
        entity_id: 9,
        entity_name: "AI use policy",
        action_url: "/policies/9/edit",
      });
      expect(mockCreate.mock.calls[0][1]).toBe(3);
      expect(mockCreate.mock.invocationCallOrder[0]).toBeLessThan(
        mockSendTemplate.mock.invocationCallOrder[0],
      );
    },
  );

  it("translates the subject and in-app text; the email body stays English", async () => {
    mockLanguage.mockResolvedValue("de");

    await notifyPolicyReviewReminder(3, 11, policy, "overdue", BASE_URL);

    expect(mockSendTemplate.mock.calls[0][1]).toBe(
      de("Policy review overdue: {title}", { title: "AI use policy" }),
    );
    expect(mockSendTemplate.mock.calls[0][1]).not.toBe("Policy review overdue: AI use policy");
    expect(mockSendTemplate.mock.calls[0][3].reminder_title).toBe("Policy review overdue");
    expect(mockCreate.mock.calls[0][0].title).toBe(de("Policy review overdue"));
    expect(mockLanguage).toHaveBeenCalledTimes(1);
  });

  it("stores the in-app notice and resolves when the email fails", async () => {
    mockSendTemplate.mockRejectedValue(new Error("EMAIL_ID is not set"));

    await expect(
      notifyPolicyReviewReminder(3, 11, policy, "due_soon", BASE_URL),
    ).resolves.toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("EMAIL_ID is not set"));
  });

  it("stores the in-app notice without an email address, and sends no email", async () => {
    mockQuery.mockResolvedValue([]);

    await notifyPolicyReviewReminder(3, 11, policy, "overdue", BASE_URL);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it("rejects when the in-app notice cannot be stored", async () => {
    mockCreate.mockRejectedValue(new Error("db down"));

    await expect(notifyPolicyReviewReminder(3, 11, policy, "overdue", BASE_URL)).rejects.toThrow(
      "db down",
    );
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});
