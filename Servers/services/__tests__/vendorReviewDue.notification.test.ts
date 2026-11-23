/**
 * notifyVendorReviewDue: title, message and email subject are keyed into the
 * recipient's language; the email body stays English.
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

import { notifyVendorReviewDue } from "../inAppNotification.service";
import { getTranslator } from "../../utils/i18n.utils";

const de = getTranslator("de");
const BASE_URL = "https://app.example.com";
const vendor = {
  id: 4,
  name: "Acme AI",
  reviewDate: "January 15, 2030",
  riskLevel: "Not assessed",
  projectCount: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([{ name: "Ada", surname: "L", email: "ada@example.com" }]);
  mockCreate.mockResolvedValue({ id: 1 });
  mockSendTemplate.mockResolvedValue(undefined);
  mockLanguage.mockResolvedValue("en");
});

describe("notifyVendorReviewDue", () => {
  it("sends the in-app notice and the email in English", async () => {
    await notifyVendorReviewDue(3, 11, vendor, BASE_URL);

    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      user_id: 11,
      type: "vendor_review_due",
      title: "Vendor review due",
      message: 'The review of vendor "Acme AI" is due on January 15, 2030.',
      entity_type: "vendor",
      entity_id: 4,
      entity_name: "Acme AI",
    });
    expect(mockCreate.mock.calls[0][1]).toBe(3);
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "ada@example.com",
      "Vendor review due: Acme AI",
      "vendor-review-due.mjml",
      expect.objectContaining({
        reviewer_name: "Ada",
        vendor_name: "Acme AI",
        review_date: "January 15, 2030",
        last_review_date: "Never",
        project_count: "2",
      }),
    );
  });

  it("translates the subject and in-app text; the email body stays English", async () => {
    mockLanguage.mockResolvedValue("de");

    await notifyVendorReviewDue(3, 11, vendor, BASE_URL);

    const subject = mockSendTemplate.mock.calls[0][1];
    expect(subject).toBe(de("Vendor review due: {name}", { name: "Acme AI" }));
    expect(subject).not.toBe("Vendor review due: Acme AI");
    expect(mockCreate.mock.calls[0][0].title).toBe(de("Vendor review due"));
    expect(mockCreate.mock.calls[0][0].message).toBe(
      de('The review of vendor "{name}" is due on {date}.', {
        name: "Acme AI",
        date: "January 15, 2030",
      }),
    );
    expect(mockSendTemplate.mock.calls[0][3].vendor_name).toBe("Acme AI");
    expect(mockLanguage).toHaveBeenCalledTimes(1);
  });
});
