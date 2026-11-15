/**
 * @fileoverview Slack Notification Service Tests
 *
 * Tests for Slack message sending, formatting, and channel invites.
 *
 * @module tests/slackNotificationService
 */

const mockPostMessage = jest.fn().mockResolvedValue({ ts: "1234.567", channel: "C123" });
const mockConversationsInfo = jest.fn().mockResolvedValue({ channel: { is_private: true } });
const mockConversationsInvite = jest.fn().mockResolvedValue({ ok: true });

jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
    conversations: {
      info: mockConversationsInfo,
      invite: mockConversationsInvite,
    },
  })),
}));

jest.mock("../../../tools/createSecureValue", () => ({
  decryptText: jest.fn(({ value }: { value: string }) => ({
    success: true,
    data: value,
  })),
}));

jest.mock("../../../utils/slackWebhook.utils", () => ({
  getDeliverableSlackWebhooksQuery: jest.fn(),
  deactivateSlackWebhookQuery: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  isExtensionEnabledForOrganization: jest.fn(),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  __esModule: true,
}));

import {
  inviteBotToChannel,
  sendSlackNotification,
  sendImmediateMessage,
  formatSlackMessage,
} from "../slackNotificationService";
import {
  deactivateSlackWebhookQuery,
  getDeliverableSlackWebhooksQuery,
} from "../../../utils/slackWebhook.utils";
import { isExtensionEnabledForOrganization } from "../../../middleware/requireExtensionEnabled.middleware";
import { SlackNotificationRoutingType } from "../../../domain.layer/enums/slack.enum";
import logger from "../../../utils/logger/fileLogger";

const mockGetSlackWebhook = getDeliverableSlackWebhooksQuery as jest.MockedFunction<
  typeof getDeliverableSlackWebhooksQuery
>;
const mockDeactivate = deactivateSlackWebhookQuery as jest.MockedFunction<
  typeof deactivateSlackWebhookQuery
>;
const mockIsEnabled = isExtensionEnabledForOrganization as jest.MockedFunction<
  typeof isExtensionEnabledForOrganization
>;

const ROUTING = SlackNotificationRoutingType.MEMBERSHIP_AND_ROLES;
const MESSAGE = { title: "Test", message: "Hello" };

describe("slackNotificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEnabled.mockResolvedValue(true);
  });

  describe("inviteBotToChannel", () => {
    it("should invite bot to private channel", async () => {
      const result = await inviteBotToChannel("token", "C123", "U999");
      expect(mockConversationsInfo).toHaveBeenCalledWith({ channel: "C123" });
      expect(mockConversationsInvite).toHaveBeenCalledWith({
        channel: "C123",
        users: "U999",
      });
      expect(result.success).toBe(true);
    });

    it("should skip invite for public channel", async () => {
      mockConversationsInfo.mockResolvedValue({ channel: { is_private: false } });
      const result = await inviteBotToChannel("token", "C123", "U999");
      expect(mockConversationsInvite).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should throw on Slack API error", async () => {
      mockConversationsInfo.mockRejectedValue(new Error("channel_not_found"));
      await expect(inviteBotToChannel("token", "C123", "U999")).rejects.toThrow(
        "channel_not_found",
      );
    });
  });

  describe("sendSlackNotification", () => {
    it("should send to all matching integrations", async () => {
      mockGetSlackWebhook.mockResolvedValue([
        {
          id: 1,
          access_token: "tok1",
          access_token_iv: "iv1",
          channel_id: "C1",
        },
        {
          id: 2,
          access_token: "tok2",
          access_token_iv: "iv2",
          channel_id: "C2",
        },
      ] as any);

      await expect(
        sendSlackNotification({ organizationId: 9, userId: 1, routingType: ROUTING }, MESSAGE),
      ).resolves.toEqual({ attempted: true, delivered: true });

      expect(mockIsEnabled).toHaveBeenCalledWith("slack", 9);
      expect(mockGetSlackWebhook).toHaveBeenCalledWith({
        organizationId: 9,
        userId: 1,
        routingType: ROUTING,
        ownConnectionsOnly: false,
      });
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });

    it("should handle no integrations gracefully", async () => {
      mockGetSlackWebhook.mockResolvedValue([]);
      await expect(
        sendSlackNotification({ organizationId: 9, userId: 1, routingType: ROUTING }, MESSAGE),
      ).resolves.toEqual({ attempted: false, delivered: false });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("should swallow errors but report non-delivery", async () => {
      mockGetSlackWebhook.mockRejectedValue(new Error("DB error"));
      await expect(
        sendSlackNotification({ organizationId: 9, userId: 1, routingType: ROUTING }, MESSAGE),
      ).resolves.toEqual({ attempted: true, delivered: false });
    });

    it("sends nothing and reads no connection when Slack is disabled for the organization", async () => {
      mockIsEnabled.mockResolvedValue(false);
      await expect(
        sendSlackNotification({ organizationId: 9, userId: 1, routingType: ROUTING }, MESSAGE),
      ).resolves.toEqual({ attempted: false, delivered: false });
      expect(mockIsEnabled).toHaveBeenCalledWith("slack", 9);
      expect(mockGetSlackWebhook).not.toHaveBeenCalled();
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it.each(["compliance", "escalation", "digest", "approval", ""])(
      "skips the unknown routing type %p without reading connections",
      async (routingType) => {
        await expect(
          sendSlackNotification({ organizationId: 9, userId: 0, routingType }, MESSAGE),
        ).resolves.toEqual({ attempted: false, delivered: false });
        expect(mockIsEnabled).not.toHaveBeenCalled();
        expect(mockGetSlackWebhook).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalled();
      },
    );

    it.each(Object.values(SlackNotificationRoutingType))(
      "delivers the routing type %p the UI offers",
      async (routingType) => {
        mockGetSlackWebhook.mockResolvedValue([]);
        await sendSlackNotification({ organizationId: 9, userId: 1, routingType }, MESSAGE);
        expect(mockGetSlackWebhook).toHaveBeenCalledWith(expect.objectContaining({ routingType }));
      },
    );

    it.each([undefined, null, 0, -1, 1.5, NaN, "9"])(
      "drops an event without a valid organization (%p), as from a job queued before scoping",
      async (organizationId) => {
        await expect(
          sendSlackNotification(
            { organizationId: organizationId as any, userId: 1, routingType: ROUTING },
            MESSAGE,
          ),
        ).resolves.toEqual({ attempted: false, delivered: false });
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("no organization"));
        expect(mockIsEnabled).not.toHaveBeenCalled();
        expect(mockGetSlackWebhook).not.toHaveBeenCalled();
        expect(mockPostMessage).not.toHaveBeenCalled();
      },
    );

    it("drops a legacy payload that only names a user", async () => {
      await expect(
        sendSlackNotification({ userId: 1, routingType: ROUTING } as any, MESSAGE),
      ).resolves.toEqual({ attempted: false, delivered: false });
      expect(mockGetSlackWebhook).not.toHaveBeenCalled();
    });

    it.each([undefined, null, 0, -4])(
      "matches organization-wide connections only when the user is %p",
      async (userId) => {
        mockGetSlackWebhook.mockResolvedValue([]);
        await sendSlackNotification({ organizationId: 9, userId, routingType: ROUTING }, MESSAGE);
        expect(mockGetSlackWebhook).toHaveBeenCalledWith({
          organizationId: 9,
          userId: null,
          routingType: ROUTING,
          ownConnectionsOnly: false,
        });
      },
    );

    it("asks for the user's own connections only when told to", async () => {
      mockGetSlackWebhook.mockResolvedValue([]);
      await sendSlackNotification(
        { organizationId: 9, userId: 4, ownConnectionsOnly: true, routingType: ROUTING },
        MESSAGE,
      );
      expect(mockGetSlackWebhook).toHaveBeenCalledWith({
        organizationId: 9,
        userId: 4,
        routingType: ROUTING,
        ownConnectionsOnly: true,
      });
    });

    it.each([undefined, null, 0])(
      "sends nothing for own connections only without a user (%p)",
      async (userId) => {
        const result = await sendSlackNotification(
          { organizationId: 9, userId, ownConnectionsOnly: true, routingType: ROUTING },
          MESSAGE,
        );
        expect(result).toEqual({ attempted: false, delivered: false });
        expect(mockGetSlackWebhook).not.toHaveBeenCalled();
      },
    );
  });

  describe("sendImmediateMessage", () => {
    it("should send formatted message to channel", async () => {
      const integration = {
        id: 1,
        access_token: "token",
        access_token_iv: "iv",
        channel_id: "C123",
      } as any;

      const result = await sendImmediateMessage(integration, { title: "Title", message: "Body" });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          text: "A message from VerifyWise",
        }),
      );
      expect(result.success).toBe(true);
      expect(result.messageId).toBe("1234.567");
    });

    it("should disable activity on channel_not_found error", async () => {
      mockPostMessage.mockRejectedValue({ data: { error: "channel_not_found" } });
      const integration = {
        id: 1,
        access_token: "token",
        access_token_iv: "iv",
        channel_id: "C123",
        organization_id: 9,
      } as any;

      await expect(sendImmediateMessage(integration, { title: "T", message: "M" })).rejects.toEqual(
        expect.objectContaining({ data: { error: "channel_not_found" } }),
      );
      expect(mockDeactivate).toHaveBeenCalledWith(1, 9);
    });

    it("should disable activity on is_archived error", async () => {
      mockPostMessage.mockRejectedValue({ data: { error: "is_archived" } });
      const integration = {
        id: 1,
        access_token: "token",
        access_token_iv: "iv",
        channel_id: "C123",
        organization_id: 9,
      } as any;

      await expect(sendImmediateMessage(integration, { title: "T", message: "M" })).rejects.toEqual(
        expect.objectContaining({ data: { error: "is_archived" } }),
      );
      expect(mockDeactivate).toHaveBeenCalledWith(1, 9);
    });

    it("does not deactivate a connection that has no organization", async () => {
      mockPostMessage.mockRejectedValue({ data: { error: "channel_not_found" } });
      const integration = {
        id: 1,
        access_token: "token",
        access_token_iv: "iv",
        channel_id: "C123",
        organization_id: null,
      } as any;

      await expect(sendImmediateMessage(integration, { title: "T", message: "M" })).rejects.toEqual(
        expect.objectContaining({ data: { error: "channel_not_found" } }),
      );
      expect(mockDeactivate).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it("rethrows an error without Slack data and deactivates nothing", async () => {
      mockPostMessage.mockRejectedValue(new Error("socket hang up"));
      const integration = {
        id: 1,
        access_token: "token",
        access_token_iv: "iv",
        channel_id: "C123",
        organization_id: 9,
      } as any;

      await expect(sendImmediateMessage(integration, { title: "T", message: "M" })).rejects.toThrow(
        "socket hang up",
      );
      expect(mockDeactivate).not.toHaveBeenCalled();
    });

    it("should not disable on other errors", async () => {
      mockPostMessage.mockRejectedValue({ data: { error: "rate_limited" } });
      const integration = {
        id: 1,
        access_token: "token",
        access_token_iv: "iv",
        channel_id: "C123",
      } as any;

      await expect(sendImmediateMessage(integration, { title: "T", message: "M" })).rejects.toEqual(
        expect.objectContaining({ data: { error: "rate_limited" } }),
      );
      expect(mockDeactivate).not.toHaveBeenCalled();
    });
  });

  describe("formatSlackMessage", () => {
    it("should include header, section, and context blocks", () => {
      const result = formatSlackMessage({ title: "Alert", message: "Something happened" });

      expect(result.text).toBe("A message from VerifyWise");
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].type).toBe("header");
      expect(result.blocks[0].text.text).toBe("Alert");
      expect(result.blocks[1].type).toBe("section");
      expect(result.blocks[1].text.text).toBe("Something happened");
      expect(result.blocks[2].type).toBe("context");
    });

    it("should include UTC timestamp in context", () => {
      const result = formatSlackMessage({ title: "T", message: "M" });
      expect(result.blocks[2].elements[0].text).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });
  });
});
