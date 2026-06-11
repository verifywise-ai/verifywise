/**
 * @fileoverview Microsoft Teams Notification Service Tests
 *
 * Tests for sending an outbound Teams message via an Incoming Webhook
 * (MessageCard POST), and no-op behaviour when no webhook URL is set.
 *
 * @module tests/teamsNotification.service
 */

jest.mock("axios", () => ({
  post: jest.fn(),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import { sendTeamsNotification } from "../teamsNotification.service";
import axios from "axios";

const mockAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe("teamsNotification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ status: 200, data: "1" } as any);
  });

  describe("sendTeamsNotification", () => {
    it("should POST a Teams MessageCard to the webhook URL", async () => {
      await sendTeamsNotification("https://outlook.office.com/webhook/abc", {
        title: "Alert",
        text: "Something happened",
      });

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockAxiosPost.mock.calls[0];
      expect(url).toBe("https://outlook.office.com/webhook/abc");
      // MessageCard (legacy actionable message card) shape
      expect(body).toEqual(
        expect.objectContaining({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          summary: "Alert",
          title: "Alert",
          text: "Something happened",
        }),
      );
    });

    it("should no-op (no throw, no POST) when webhook URL is empty", async () => {
      await expect(
        sendTeamsNotification("", { title: "T", text: "B" }),
      ).resolves.toBeUndefined();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it("should no-op (no throw, no POST) when webhook URL is undefined", async () => {
      await expect(
        sendTeamsNotification(undefined as any, { title: "T", text: "B" }),
      ).resolves.toBeUndefined();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it("should swallow errors from the HTTP client (no throw)", async () => {
      mockAxiosPost.mockRejectedValue(new Error("network down"));
      await expect(
        sendTeamsNotification("https://outlook.office.com/webhook/abc", {
          title: "T",
          text: "B",
        }),
      ).resolves.toBeUndefined();
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });
  });
});
