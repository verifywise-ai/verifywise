/**
 * notifyUserAssignedMany: one in-app notification and one assignment email
 * for a bulk assignment, listing the items (capped, escaped).
 */
const mockQuery = jest.fn();
const mockCreate = jest.fn();
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
const mockLanguage = jest.fn();
jest.mock("../../utils/userPreference.utils", () => ({
  getUserLanguage: (...args: unknown[]) => mockLanguage(...args),
}));
jest.mock("../notificationService", () => ({
  notificationService: {
    sendEmailWithTemplate: (...args: unknown[]) => mockSendTemplate(...args),
  },
}));

import { notifyUserAssignedMany } from "../inAppNotification.service";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import { getTranslator } from "../../utils/i18n.utils";
import {
  NotificationEntityType,
  NotificationType,
} from "../../domain.layer/interfaces/i.notification";

const texts = {
  titleKey: "{count} risks were assigned to you",
  messageKey: "{assigner} assigned you as Risk Owner for {count} risks: {names}",
  messageMoreKey:
    "{assigner} assigned you as Risk Owner for {count} risks: {names} and {more} more",
  itemsLabel: "risks",
  roleDescription: "Manage these risks.",
};

const assignment = (names: string[]) => ({
  entityType: "project_risk",
  items: names.map((name, i) => ({ id: i + 1, name })),
  roleType: "Risk Owner" as const,
  entityUrl: "/risk-management",
  texts,
});

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue([{ name: "Bo", surname: "New", email: "bo@x.io" }]);
  mockCreate.mockReset().mockImplementation(async (n: unknown) => ({ id: 1, ...(n as object) }));
  mockSendTemplate.mockReset().mockResolvedValue(undefined);
  mockLanguage.mockReset().mockResolvedValue(undefined);
});

describe("notifyUserAssignedMany", () => {
  it("stores one assignment notification and sends one email listing the risks", async () => {
    await notifyUserAssignedMany(
      4,
      7,
      assignment(["R1", "R2", "R3"]),
      "Ada Admin",
      "https://app.test",
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      {
        user_id: 7,
        type: NotificationType.ASSIGNMENT_OWNER,
        title: "3 risks were assigned to you",
        message: "Ada Admin assigned you as Risk Owner for 3 risks: R1, R2, R3",
        entity_type: NotificationEntityType.RISK,
        action_url: "/risk-management",
      },
      4,
    );

    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    const [to, subject, template, vars] = mockSendTemplate.mock.calls[0];
    expect(to).toBe("bo@x.io");
    expect(subject).toBe("3 risks were assigned to you");
    expect(template).toBe(EMAIL_TEMPLATES.ASSIGNMENT_NOTIFICATION);
    expect(vars).toEqual(
      expect.objectContaining({
        recipient_name: "Bo",
        assigner_name: "Ada Admin",
        role_type: "Risk Owner",
        entity_type: "risks",
        entity_name: "3 risks",
        entity_url: "https://app.test/risk-management",
      }),
    );
    expect(vars.role_description).toBe("Manage these risks.");
    expect((vars.entity_context_html.match(/<li /g) ?? []).length).toBe(3);
  });

  it("lists at most 20 risks, then how many more", async () => {
    const names = Array.from({ length: 23 }, (_, i) => `Risk ${i + 1}`);

    await notifyUserAssignedMany(4, 7, assignment(names), "Ada Admin", "https://app.test");

    const stored = mockCreate.mock.calls[0][0];
    expect(stored.title).toBe("23 risks were assigned to you");
    expect(stored.message).toBe(
      `Ada Admin assigned you as Risk Owner for 23 risks: ${names.slice(0, 20).join(", ")} and 3 more`,
    );
    const html: string = mockSendTemplate.mock.calls[0][3].entity_context_html;
    expect((html.match(/<li /g) ?? []).length).toBe(21);
    expect(html).toContain("Risk 20<");
    expect(html).not.toContain("Risk 21<");
    expect(html).toContain("and 3 more</li>");
  });

  it("translates the title, message and subject into the recipient's language", async () => {
    mockLanguage.mockResolvedValue("de");
    const de = getTranslator("de");

    await notifyUserAssignedMany(4, 7, assignment(["R1", "R2"]), "Ada Admin", "https://app.test");

    const stored = mockCreate.mock.calls[0][0];
    expect(stored.title).toBe(de(texts.titleKey, { count: 2 }));
    expect(stored.title).not.toBe("2 risks were assigned to you");
    expect(stored.message).toBe(
      de(texts.messageKey, { assigner: "Ada Admin", count: 2, names: "R1, R2" }),
    );
    expect(mockSendTemplate.mock.calls[0][1]).toBe(de(texts.titleKey, { count: 2 }));
  });

  it("escapes risk names in the email list", async () => {
    await notifyUserAssignedMany(
      4,
      7,
      assignment(['<img src=x onerror="alert(1)">', "A & B"]),
      "Ada Admin",
      "https://app.test",
    );

    const html: string = mockSendTemplate.mock.calls[0][3].entity_context_html;
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=");
    expect(html).toContain("A &amp; B");
  });

  it("sends nothing when the user does not exist", async () => {
    mockQuery.mockResolvedValue([]);

    await notifyUserAssignedMany(4, 7, assignment(["R1", "R2"]), "Ada Admin", "https://app.test");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});
