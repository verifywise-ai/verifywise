/**
 * Keyed notifications: titleKey / messageKey / subjectKey are translated inside
 * sendInAppNotification with the recipient's saved language, read once per
 * recipient (or taken from `lang` when the caller already has it).
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

import { notifyFileExpiring, sendInAppNotification } from "../inAppNotification.service";
import { dispatchAlerts } from "../../utils/mrmAlerts.utils";
import { getTranslator } from "../../utils/i18n.utils";
import { NotificationType } from "../../domain.layer/interfaces/i.notification";

const de = getTranslator("de");
const fr = getTranslator("fr");

const keyed = {
  type: NotificationType.MRM_METRIC_BREACH,
  titleKey: "Metric breach: {metric}",
  titleVars: { metric: "auc" },
  messageKey: '{label} — "{metric}" = {value} breached its monitoring threshold.',
  messageVars: { label: "Model A", metric: "auc", value: "0.5" },
};
const email = {
  template: "breach",
  subjectKey: "Metric breach: {metric}",
  subjectVars: { metric: "auc" },
  variables: {},
};

const storedAt = (i: number) => mockCreate.mock.calls[i][0] as { title: string; message: string };

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  mockQuery.mockReset().mockResolvedValue([{ id: 1, name: "Ada", email: "ada@x.io" }]);
  mockCreate.mockReset().mockImplementation(async (n: unknown) => ({ id: 1, ...(n as object) }));
  mockLanguage.mockReset();
  mockSendTemplate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("sendInAppNotification with keys", () => {
  it("translates title, message and subject with the recipient's language, read once", async () => {
    mockLanguage.mockResolvedValue("de");
    await sendInAppNotification(1, { ...keyed, user_id: 7 }, true, email);

    expect(mockLanguage).toHaveBeenCalledTimes(1);
    expect(mockLanguage).toHaveBeenCalledWith(7);
    expect(storedAt(0)).toEqual(
      expect.objectContaining({
        title: de("Metric breach: {metric}", { metric: "auc" }),
        message: de(keyed.messageKey, keyed.messageVars),
      }),
    );
    expect(storedAt(0).title).not.toBe("Metric breach: auc");
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "ada@x.io",
      de("Metric breach: {metric}", { metric: "auc" }),
      "breach",
      {},
    );
  });

  it("falls back to English for an English (or unset) language", async () => {
    mockLanguage.mockResolvedValue("en");
    await sendInAppNotification(1, { ...keyed, user_id: 7 }, true, email);

    expect(storedAt(0)).toEqual(
      expect.objectContaining({
        title: "Metric breach: auc",
        message: 'Model A — "auc" = 0.5 breached its monitoring threshold.',
      }),
    );
    expect(mockSendTemplate).toHaveBeenCalledWith("ada@x.io", "Metric breach: auc", "breach", {});
  });

  it("uses a language the caller passes instead of reading it", async () => {
    await sendInAppNotification(1, { ...keyed, user_id: 7, lang: "fr" }, true, email);

    expect(mockLanguage).not.toHaveBeenCalled();
    expect(storedAt(0).title).toBe(fr("Metric breach: {metric}", { metric: "auc" }));
  });

  it("does not read a language when nothing is keyed", async () => {
    await sendInAppNotification(
      1,
      { user_id: 7, type: NotificationType.MRM_METRIC_BREACH, title: "Plain", message: "Text" },
      true,
      { template: "breach", subject: "Plain subject", variables: {} },
    );

    expect(mockLanguage).not.toHaveBeenCalled();
    expect(storedAt(0)).toEqual(expect.objectContaining({ title: "Plain", message: "Text" }));
    expect(mockSendTemplate).toHaveBeenCalledWith("ada@x.io", "Plain subject", "breach", {});
  });
});

describe("notifyFileExpiring", () => {
  it("words the in-app row and subject for the recipient, keeps the email body English", async () => {
    mockLanguage.mockResolvedValue("de");
    await notifyFileExpiring(
      1,
      7,
      { id: 3, name: "plan.pdf", expiryDate: "2026-12-01", daysRemaining: 1 },
      "https://app.test",
    );

    expect(mockLanguage).toHaveBeenCalledTimes(1);
    expect(storedAt(0)).toEqual(
      expect.objectContaining({
        title: de("File expiring soon"),
        message: de('File "{name}" expires on {expiryDate} ({daysRemaining})', {
          name: "plan.pdf",
          expiryDate: "2026-12-01",
          daysRemaining: de("1 day"),
        }),
      }),
    );
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "ada@x.io",
      de("File expiring soon: {name}", { name: "plan.pdf" }),
      expect.anything(),
      expect.objectContaining({ days_remaining: "1 day" }),
    );
  });
});

describe("dispatchAlerts", () => {
  it("translates each recipient's notification and subject with their own language", async () => {
    mockLanguage.mockImplementation(async (userId: number) => (userId === 10 ? "de" : "fr"));
    await dispatchAlerts(1, [10, 20], keyed, true, email);

    expect(mockLanguage).toHaveBeenCalledTimes(2);
    expect(storedAt(0).title).toBe(de("Metric breach: {metric}", { metric: "auc" }));
    expect(storedAt(1).title).toBe(fr("Metric breach: {metric}", { metric: "auc" }));
    expect(mockSendTemplate.mock.calls.map((c) => c[1])).toEqual([
      de("Metric breach: {metric}", { metric: "auc" }),
      fr("Metric breach: {metric}", { metric: "auc" }),
    ]);
  });

  it("does not read languages for an in-app-only alert with fixed text", async () => {
    await dispatchAlerts(
      1,
      [10, 20],
      { type: NotificationType.MRM_METRIC_BREACH, title: "Fixed", message: "Text" },
      false,
      { template: "breach", subject: "Fixed", variables: {} },
    );

    expect(mockLanguage).not.toHaveBeenCalled();
    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(storedAt(1).title).toBe("Fixed");
  });
});
