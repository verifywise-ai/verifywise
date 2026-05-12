/**
 * @fileoverview Notification Subscriber Tests
 *
 * Tests for Redis subscriber setup and message handling.
 *
 * @module tests/notificationSubscriber.service
 */

const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockQuit = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();

jest.mock("../../database/redis", () => ({
  default: {
    duplicate: jest.fn(() => ({
      on: mockOn,
      subscribe: mockSubscribe,
      quit: mockQuit,
    })),
  },
  __esModule: true,
}));

jest.mock("../../controllers/notification.ctrl", () => ({
  getConnection: jest.fn(),
}));

import {
  setupNotificationSubscriber,
  closeNotificationSubscriber,
} from "../notificationSubscriber.service";
import { getConnection } from "../../controllers/notification.ctrl";

const mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;

describe("notificationSubscriber.service", () => {
  let messageHandler: ((channel: string, message: string) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    messageHandler = null;

    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === "message") {
        messageHandler = handler;
      }
    });
  });

  describe("setupNotificationSubscriber", () => {
    it("should subscribe to approval and in-app notification channels", async () => {
      await setupNotificationSubscriber();
      expect(mockSubscribe).toHaveBeenCalledWith("approval-notifications", "in-app-notifications");
    });

    it("should register ready and error handlers", async () => {
      await setupNotificationSubscriber();
      expect(mockOn).toHaveBeenCalledWith("ready", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("should write notification to active connection", async () => {
      const mockWrite = jest.fn();
      mockGetConnection.mockReturnValue({
        organizationId: 1,
        userId: 2,
        response: { write: mockWrite } as any,
      });

      await setupNotificationSubscriber();

      const payload = JSON.stringify({
        organizationId: 1,
        userId: 2,
        notification: { type: "approval_request" },
      });

      messageHandler!("approval-notifications", payload);

      expect(mockGetConnection).toHaveBeenCalledWith("1:2");
      expect(mockWrite).toHaveBeenCalledWith(`data: {"type":"approval_request"}\n\n`);
    });

    it("should skip messages from unknown channels", async () => {
      await setupNotificationSubscriber();

      const payload = JSON.stringify({
        organizationId: 1,
        userId: 2,
        notification: { type: "test" },
      });

      messageHandler!("unknown-channel", payload);
      expect(mockGetConnection).not.toHaveBeenCalled();
    });

    it("should skip invalid message format", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      await setupNotificationSubscriber();

      messageHandler!("approval-notifications", JSON.stringify({ missing: "fields" }));

      expect(mockGetConnection).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should skip when tenant does not match", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockGetConnection.mockReturnValue({
        organizationId: 99,
        userId: 2,
        response: { write: jest.fn() } as any,
      });

      await setupNotificationSubscriber();

      const payload = JSON.stringify({
        organizationId: 1,
        userId: 2,
        notification: { type: "test" },
      });

      messageHandler!("approval-notifications", payload);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Tenant mismatch"));
      consoleSpy.mockRestore();
    });

    it("should skip when user does not match", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockGetConnection.mockReturnValue({
        organizationId: 1,
        userId: 99,
        response: { write: jest.fn() } as any,
      });

      await setupNotificationSubscriber();

      const payload = JSON.stringify({
        organizationId: 1,
        userId: 2,
        notification: { type: "test" },
      });

      messageHandler!("approval-notifications", payload);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("User mismatch"));
      consoleSpy.mockRestore();
    });

    it("should handle write errors gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const mockWrite = jest.fn().mockImplementation(() => {
        throw new Error("Connection closed");
      });
      mockGetConnection.mockReturnValue({
        organizationId: 1,
        userId: 2,
        response: { write: mockWrite } as any,
      });

      await setupNotificationSubscriber();

      const payload = JSON.stringify({
        organizationId: 1,
        userId: 2,
        notification: { type: "test" },
      });

      messageHandler!("approval-notifications", payload);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error sending notification"),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it("should handle JSON parse errors gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      await setupNotificationSubscriber();

      messageHandler!("approval-notifications", "not-json");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error processing notification message:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it("should log when no active connection exists", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      mockGetConnection.mockReturnValue(undefined);

      await setupNotificationSubscriber();

      const payload = JSON.stringify({
        organizationId: 1,
        userId: 2,
        notification: { type: "test" },
      });

      messageHandler!("approval-notifications", payload);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No active connection"));
      consoleSpy.mockRestore();
    });

    it("should rethrow setup errors", async () => {
      mockSubscribe.mockRejectedValueOnce(new Error("Redis error"));
      await expect(setupNotificationSubscriber()).rejects.toThrow("Redis error");
    });
  });

  describe("closeNotificationSubscriber", () => {
    it("should quit the subscriber client", async () => {
      await setupNotificationSubscriber();
      await closeNotificationSubscriber();
      expect(mockQuit).toHaveBeenCalled();
    });

    it("should handle already-closed client gracefully", async () => {
      mockQuit.mockRejectedValueOnce(new Error("Connection already closed"));
      await setupNotificationSubscriber();
      await expect(closeNotificationSubscriber()).resolves.toBeUndefined();
    });

    it("should do nothing if subscriber client is null", async () => {
      await closeNotificationSubscriber();
      expect(mockQuit).not.toHaveBeenCalled();
    });
  });
});
