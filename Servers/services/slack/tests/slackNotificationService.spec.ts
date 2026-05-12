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
  getSlackWebhookByIdAndRoutingType: jest.fn(),
}));

jest.mock("../../../controllers/slackWebhook.ctrl", () => ({
  disableSlackActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import {
  inviteBotToChannel,
  sendSlackNotification,
  sendImmediateMessage,
  formatSlackMessage,
} from "../slackNotificationService";
import { getSlackWebhookByIdAndRoutingType } from "../../../utils/slackWebhook.utils";
import { disableSlackActivity } from "../../../controllers/slackWebhook.ctrl";

const mockGetSlackWebhook = getSlackWebhookByIdAndRoutingType as jest.MockedFunction<
  typeof getSlackWebhookByIdAndRoutingType
>;
const mockDisableSlackActivity = disableSlackActivity as jest.MockedFunction<
  typeof disableSlackActivity
>;

describe("slackNotificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

      await sendSlackNotification(
        { userId: 1, routingType: "approval" },
        { title: "Test", message: "Hello" },
      );

      expect(mockGetSlackWebhook).toHaveBeenCalledWith(1, "approval");
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });

    it("should handle no integrations gracefully", async () => {
      mockGetSlackWebhook.mockResolvedValue([]);
      await sendSlackNotification(
        { userId: 1, routingType: "approval" },
        { title: "Test", message: "Hello" },
      );
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("should swallow errors", async () => {
      mockGetSlackWebhook.mockRejectedValue(new Error("DB error"));
      await expect(
        sendSlackNotification(
          { userId: 1, routingType: "approval" },
          { title: "Test", message: "Hello" },
        ),
      ).resolves.toBeUndefined();
    });
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
      } as any;

      await expect(sendImmediateMessage(integration, { title: "T", message: "M" })).rejects.toEqual(
        expect.objectContaining({ data: { error: "channel_not_found" } }),
      );
      expect(mockDisableSlackActivity).toHaveBeenCalledWith(1);
    });

    it("should disable activity on is_archived error", async () => {
      mockPostMessage.mockRejectedValue({ data: { error: "is_archived" } });
      const integration = {
        id: 1,
        access_token: "token",
        access_token_iv: "iv",
        channel_id: "C123",
      } as any;

      await expect(sendImmediateMessage(integration, { title: "T", message: "M" })).rejects.toEqual(
        expect.objectContaining({ data: { error: "is_archived" } }),
      );
      expect(mockDisableSlackActivity).toHaveBeenCalledWith(1);
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
      expect(mockDisableSlackActivity).not.toHaveBeenCalled();
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
