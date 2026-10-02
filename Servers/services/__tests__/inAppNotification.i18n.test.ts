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

import {
  notifyEvidenceStale,
  notifyModelRiskDueSoon,
  notifyParentLevelChanged,
  notifyRiskDeadlineDueSoon,
  notifyRiskOfModelCandidates,
} from "../inAppNotification.service";
import { getTranslator, type SupportedLang } from "../../utils/i18n.utils";

const NOW = new Date("2026-09-10T12:00:00Z");
const inDays = (days: number) => new Date(NOW.getTime() + days * 86400000);
const longDate = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });

const OWNER = 8;
const risk = { id: 5, risk_name: "Zebra stall", risk_owner: OWNER };

/** What was stored for the (single) notification the function wrote. */
const stored = () => {
  expect(mockCreate).toHaveBeenCalledTimes(1);
  return mockCreate.mock.calls[0][0] as { title: string; message: string };
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  mockQuery
    .mockReset()
    .mockResolvedValue([{ name: "Ada", surname: "Lovelace", email: "ada@x.io" }]);
  mockCreate.mockReset().mockImplementation(async (notification: unknown) => ({
    id: 1,
    ...(notification as object),
  }));
  mockLanguage.mockReset();
  mockSendTemplate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const DISTANCES: Array<[number, string, Record<string, number>]> = [
  [3, "in {days} days", { days: 3 }],
  [1, "tomorrow", {}],
  [0, "today", {}],
  [-2, "{days} days overdue", { days: 2 }],
];

describe.each<[SupportedLang, string]>([
  ["de", "de-DE"],
  ["fr", "fr-FR"],
])("in-app notifications for a %s recipient", (lang, locale) => {
  const t = getTranslator(lang);
  beforeEach(() => mockLanguage.mockResolvedValue(lang));

  it("words the evidence-stale notice in the recipient's language", async () => {
    await notifyEvidenceStale(1, risk);
    expect(mockLanguage).toHaveBeenCalledWith(OWNER);
    expect(stored()).toEqual(
      expect.objectContaining({
        title: t("Evidence stale"),
        message: t('Risk "{name}" has stale linked evidence. Review and refresh it.', {
          name: "Zebra stall",
        }),
      }),
    );
    expect(stored().title).not.toBe("Evidence stale");
  });

  it("words the stale-inheritance notice in the recipient's language", async () => {
    await notifyParentLevelChanged(1, risk);
    expect(stored()).toEqual(
      expect.objectContaining({
        title: t("Inherited risk level may be stale"),
        message: t(
          'A parent risk\'s level changed, so the inherited level on "{name}" may be out of date. Review it.',
          { name: "Zebra stall" },
        ),
      }),
    );
    expect(stored().title).not.toBe("Inherited risk level may be stale");
  });

  it.each([
    [
      1,
      'Risk "{riskName}" now shares a project with 1 model risk from "{modelName}". Review the suggested links.',
    ],
    [
      3,
      'Risk "{riskName}" now shares a project with {count} model risks from "{modelName}". Review the suggested links.',
    ],
  ])("words the model-candidates notice for %i candidate(s)", async (count, key) => {
    await notifyRiskOfModelCandidates(1, risk, { id: 2, name: "Orchid model" }, count);
    expect(stored()).toEqual(
      expect.objectContaining({
        title: t("New model risks to review"),
        message: t(key, { riskName: "Zebra stall", count, modelName: "Orchid model" }),
      }),
    );
    expect(stored().message).not.toContain("shares a project with");
  });

  it.each(DISTANCES)("words a risk deadline %i day(s) away", async (days, key, vars) => {
    const deadline = inDays(days);
    await notifyRiskDeadlineDueSoon(
      1,
      OWNER,
      { id: 5, name: "Zebra stall", deadline },
      7,
      "https://app.test",
      false,
    );
    expect(stored().title).toBe(t("Risk deadline approaching"));
    expect(stored().message).toBe(
      t('Risk "{name}" is due {distance} ({date}).', {
        name: "Zebra stall",
        distance: t(key, vars),
        date: longDate(deadline, locale),
      }),
    );
  });

  it("words a model risk target date the same way", async () => {
    const deadline = inDays(3);
    await notifyModelRiskDueSoon(
      1,
      OWNER,
      { id: 5, name: "Drift", deadline, model_id: 2 },
      7,
      "https://app.test",
      false,
    );
    expect(stored().title).toBe(t("Model risk target date approaching"));
    expect(stored().message).toBe(
      t('Model risk "{name}" is due {distance} ({date}).', {
        name: "Drift",
        distance: t("in {days} days", { days: 3 }),
        date: longDate(deadline, locale),
      }),
    );
  });

  // The email template is English, so translated variables would drop foreign
  // words into an English sentence. Only the in-app row follows the recipient.
  it("leaves the email in English", async () => {
    const deadline = inDays(3);
    await notifyRiskDeadlineDueSoon(
      1,
      OWNER,
      { id: 5, name: "Zebra stall", deadline },
      7,
      "https://app.test",
      true,
    );
    expect(stored().title).toBe(t("Risk deadline approaching"));
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "ada@x.io",
      "Risk deadline approaching: Zebra stall",
      expect.anything(),
      expect.objectContaining({
        entity_kind: "Risk",
        deadline_label: "Deadline",
        days_text: "in 3 days",
        deadline_date: longDate(deadline, "en-US"),
      }),
    );
  });
});

describe("in-app notifications for an English recipient", () => {
  beforeEach(() => mockLanguage.mockResolvedValue("en"));

  // Guards the refactor: English text must be exactly what it was before the
  // sentences became dictionary keys.
  it.each([
    [3, "in 3 days"],
    [1, "tomorrow"],
    [0, "today"],
    [-2, "2 days overdue"],
  ])("keeps the original deadline wording for %i day(s)", async (days, distance) => {
    const deadline = inDays(days);
    await notifyRiskDeadlineDueSoon(
      1,
      OWNER,
      { id: 5, name: "Zebra stall", deadline },
      7,
      "https://app.test",
      false,
    );
    expect(stored()).toEqual(
      expect.objectContaining({
        title: "Risk deadline approaching",
        message: `Risk "Zebra stall" is due ${distance} (${longDate(deadline, "en-US")}).`,
      }),
    );
  });

  it("keeps the original singular and plural model-candidate wording", async () => {
    const send = (count: number) =>
      notifyRiskOfModelCandidates(1, risk, { id: 2, name: "Orchid model" }, count);
    await send(1);
    expect(stored().message).toBe(
      'Risk "Zebra stall" now shares a project with 1 model risk from "Orchid model". Review the suggested links.',
    );
    mockCreate.mockClear();
    await send(3);
    expect(stored().message).toBe(
      'Risk "Zebra stall" now shares a project with 3 model risks from "Orchid model". Review the suggested links.',
    );
  });

  it("keeps the original evidence and inheritance wording", async () => {
    await notifyEvidenceStale(1, risk);
    expect(stored()).toEqual(
      expect.objectContaining({
        title: "Evidence stale",
        message: 'Risk "Zebra stall" has stale linked evidence. Review and refresh it.',
      }),
    );
    mockCreate.mockClear();
    await notifyParentLevelChanged(1, risk);
    expect(stored()).toEqual(
      expect.objectContaining({
        title: "Inherited risk level may be stale",
        message:
          'A parent risk\'s level changed, so the inherited level on "Zebra stall" may be out of date. Review it.',
      }),
    );
  });

  it("sends nothing, and reads no language, when the risk has no owner", async () => {
    const orphan = { ...risk, risk_owner: null };
    await notifyEvidenceStale(1, orphan);
    await notifyParentLevelChanged(1, orphan);
    await notifyRiskOfModelCandidates(1, orphan, { id: 2, name: "Orchid model" }, 2);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLanguage).not.toHaveBeenCalled();
  });
});
