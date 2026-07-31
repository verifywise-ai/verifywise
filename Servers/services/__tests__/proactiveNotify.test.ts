/**
 * @fileoverview Proactive Notify (unified fanout) Tests
 *
 * Tests for notifyProactive(): dispatches a notification to only the
 * requested channels (in-app, email, slack, teams), and isolates each
 * channel sender so that one failing channel does not block the others.
 *
 * @module tests/proactiveNotify
 */

jest.mock("../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
}));

jest.mock("../slack/slackNotificationService", () => ({
  sendSlackNotification: jest.fn(),
}));

jest.mock("../teams/teamsNotification.service", () => ({
  sendTeamsNotification: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

jest.mock("../../utils/user.utils", () => ({
  getAllUsersQuery: jest.fn(),
}));

import { notifyProactive } from "../proactiveNotify";
import { sendInAppNotification } from "../inAppNotification.service";
import { sendSlackNotification } from "../slack/slackNotificationService";
import { sendTeamsNotification } from "../teams/teamsNotification.service";
import { getAllUsersQuery } from "../../utils/user.utils";
import {
  NotificationType,
  NotificationEntityType,
} from "../../domain.layer/interfaces/i.notification";

const mockSendInApp = sendInAppNotification as jest.MockedFunction<typeof sendInAppNotification>;
const mockSendSlack = sendSlackNotification as jest.MockedFunction<typeof sendSlackNotification>;
const mockSendTeams = sendTeamsNotification as jest.MockedFunction<typeof sendTeamsNotification>;
const mockGetAllUsers = getAllUsersQuery as jest.MockedFunction<typeof getAllUsersQuery>;

const baseNotification = {
  user_id: 7,
  type: NotificationType.TASK_ASSIGNED,
  title: "Hello",
  message: "World",
  entity_type: NotificationEntityType.TASK,
  entity_id: 1,
};

describe("proactiveNotify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendInApp.mockResolvedValue({} as any);
    mockSendSlack.mockResolvedValue(undefined as any);
    mockSendTeams.mockResolvedValue(undefined as any);
  });

  it("should default to in-app only when no channels flag is given", async () => {
    await notifyProactive(42, {
      title: "Hello",
      body: "World",
      notification: baseNotification,
    });

    expect(mockSendInApp).toHaveBeenCalledTimes(1);
    expect(mockSendInApp.mock.calls[0][0]).toBe(42);
    // email not requested -> sendEmailNotification should be falsy
    expect(mockSendInApp.mock.calls[0][2]).toBeFalsy();
    expect(mockSendSlack).not.toHaveBeenCalled();
    expect(mockSendTeams).not.toHaveBeenCalled();
  });

  it("should call ONLY the slack sender when only slack is requested", async () => {
    await notifyProactive(42, {
      title: "Hello",
      body: "World",
      notification: baseNotification,
      channels: { inApp: false, slack: { userId: 7, routingType: "approval" } },
    });

    expect(mockSendInApp).not.toHaveBeenCalled();
    expect(mockSendTeams).not.toHaveBeenCalled();
    expect(mockSendSlack).toHaveBeenCalledTimes(1);
    expect(mockSendSlack).toHaveBeenCalledWith(
      { userId: 7, routingType: "approval" },
      expect.objectContaining({ title: "Hello", message: "World" }),
    );
  });

  it("should call ONLY the teams sender when only teams is requested", async () => {
    await notifyProactive(42, {
      title: "Hello",
      body: "World",
      notification: baseNotification,
      channels: { inApp: false, teams: { webhookUrl: "https://teams/webhook" } },
    });

    expect(mockSendInApp).not.toHaveBeenCalled();
    expect(mockSendSlack).not.toHaveBeenCalled();
    expect(mockSendTeams).toHaveBeenCalledTimes(1);
    expect(mockSendTeams).toHaveBeenCalledWith(
      "https://teams/webhook",
      expect.objectContaining({ title: "Hello", text: "World" }),
    );
  });

  it("should request email by passing sendEmailNotification=true to the in-app sender", async () => {
    const emailConfig = { template: "tmpl", subject: "Subj", variables: { a: "b" } };
    await notifyProactive(42, {
      title: "Hello",
      body: "World",
      notification: baseNotification,
      channels: { email: emailConfig },
    });

    expect(mockSendInApp).toHaveBeenCalledTimes(1);
    expect(mockSendInApp.mock.calls[0][2]).toBe(true);
    expect(mockSendInApp.mock.calls[0][3]).toEqual(emailConfig);
  });

  it("should dispatch to all requested channels", async () => {
    await notifyProactive(42, {
      title: "Hello",
      body: "World",
      notification: baseNotification,
      channels: {
        inApp: true,
        slack: { userId: 7, routingType: "approval" },
        teams: { webhookUrl: "https://teams/webhook" },
      },
    });

    expect(mockSendInApp).toHaveBeenCalledTimes(1);
    expect(mockSendSlack).toHaveBeenCalledTimes(1);
    expect(mockSendTeams).toHaveBeenCalledTimes(1);
  });

  it("should not let a failing channel block the others", async () => {
    mockSendInApp.mockRejectedValue(new Error("db down"));

    await expect(
      notifyProactive(42, {
        title: "Hello",
        body: "World",
        notification: baseNotification,
        channels: {
          inApp: true,
          slack: { userId: 7, routingType: "approval" },
          teams: { webhookUrl: "https://teams/webhook" },
        },
      }),
    ).resolves.toBeUndefined();

    // in-app threw, but slack + teams were still attempted
    expect(mockSendInApp).toHaveBeenCalledTimes(1);
    expect(mockSendSlack).toHaveBeenCalledTimes(1);
    expect(mockSendTeams).toHaveBeenCalledTimes(1);
  });

  // Regression: org-wide proactive alerts pass user_id 0 as a broadcast marker.
  // notifications.user_id is NOT NULL REFERENCES users(id), so 0 would be a FK
  // violation — it must be expanded to real org-admin recipients.
  describe("broadcast recipient resolution (user_id 0)", () => {
    const broadcast = { ...baseNotification, user_id: 0 };

    it("fans out one in-app notification per org admin, never user_id 0", async () => {
      mockGetAllUsers.mockResolvedValue([
        { id: 11, role_id: 1 },
        { id: 12, role_id: 1 },
        { id: 13, role_id: 3 }, // Editor — not an admin, excluded
      ] as any);

      await notifyProactive(42, { title: "Hello", body: "World", notification: broadcast });

      expect(mockGetAllUsers).toHaveBeenCalledWith(42);
      expect(mockSendInApp).toHaveBeenCalledTimes(2);
      const recipientIds = mockSendInApp.mock.calls.map((c) => (c[1] as any).user_id);
      expect(recipientIds.sort()).toEqual([11, 12]);
      expect(recipientIds).not.toContain(0);
    });

    it("falls back to all org users when the org has no admin", async () => {
      mockGetAllUsers.mockResolvedValue([
        { id: 21, role_id: 3 },
        { id: 22, role_id: 4 },
      ] as any);

      await notifyProactive(42, { title: "Hello", body: "World", notification: broadcast });

      expect(mockSendInApp).toHaveBeenCalledTimes(2);
    });

    it("passes a real user_id straight through without resolving recipients", async () => {
      await notifyProactive(42, {
        title: "Hello",
        body: "World",
        notification: baseNotification, // user_id 7
      });

      expect(mockGetAllUsers).not.toHaveBeenCalled();
      expect(mockSendInApp).toHaveBeenCalledTimes(1);
      expect((mockSendInApp.mock.calls[0][1] as any).user_id).toBe(7);
    });
  });
});
