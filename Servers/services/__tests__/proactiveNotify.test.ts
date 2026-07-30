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

import { notifyProactive } from "../proactiveNotify";
import { sendInAppNotification } from "../inAppNotification.service";
import { sendSlackNotification } from "../slack/slackNotificationService";
import { sendTeamsNotification } from "../teams/teamsNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../domain.layer/interfaces/i.notification";

const mockSendInApp = sendInAppNotification as jest.MockedFunction<typeof sendInAppNotification>;
const mockSendSlack = sendSlackNotification as jest.MockedFunction<typeof sendSlackNotification>;
const mockSendTeams = sendTeamsNotification as jest.MockedFunction<typeof sendTeamsNotification>;

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
});
