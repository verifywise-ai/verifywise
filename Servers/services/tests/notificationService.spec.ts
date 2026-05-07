/**
 * @fileoverview NotificationService Tests
 *
 * Tests for the NotificationService class including singleton pattern,
 * token bucket rate limiting, exponential backoff, and error sanitization.
 *
 * @module tests/notificationService
 */

// Mock dependencies BEFORE imports
jest.mock("../emailService", () => ({
  sendEmail: jest.fn(),
}));

jest.mock("../../constants/emailTemplates", () => ({
  TEMPLATES_DIR: "/mock/templates",
}));

jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

import { NotificationService } from "../notificationService";
import { sendEmail } from "../emailService";
import fs from "fs/promises";

// Cast mocks
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;

describe("NotificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton between tests
    (NotificationService as any).instance = undefined;

    // Default mock: rate-limit state file does not exist
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockWriteFile.mockResolvedValue(undefined);
  });

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = NotificationService.getInstance();
      const instance2 = NotificationService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create a new instance if none exists", () => {
      const instance = NotificationService.getInstance();

      expect(instance).toBeInstanceOf(NotificationService);
    });
  });

  describe("token bucket refill", () => {
    it("should allow sending emails when tokens are available", async () => {
      mockReadFile
        .mockResolvedValueOnce("<mjml>template</mjml>" as any) // rate limit state
        .mockResolvedValueOnce("<mjml>template</mjml>" as any); // template file read
      mockSendEmail.mockResolvedValue({ success: true } as any);

      const service = NotificationService.getInstance();

      // This should succeed since tokens start at MAX_TOKENS (3)
      await expect(
        service.sendEmailWithTemplate("to@test.com", "Subject", "template.mjml", { key: "val" }),
      ).resolves.not.toThrow();
    });
  });

  describe("exponential backoff", () => {
    it("should calculate increasing delays on consecutive failures", () => {
      const service = NotificationService.getInstance();

      // Access private method via any
      const svc = service as any;

      // No failures: base delay
      svc.rateLimitState.consecutiveFailures = 0;
      const delay0 = svc.getBackoffDelay();
      expect(delay0).toBe(600); // MIN_DELAY

      // 1 failure: 2x
      svc.rateLimitState.consecutiveFailures = 1;
      const delay1 = svc.getBackoffDelay();
      expect(delay1).toBe(1200); // 600 * 2^1

      // 2 failures: 4x
      svc.rateLimitState.consecutiveFailures = 2;
      const delay2 = svc.getBackoffDelay();
      expect(delay2).toBe(2400); // 600 * 2^2
    });

    it("should cap backoff delay at 10 seconds", () => {
      const service = NotificationService.getInstance();
      const svc = service as any;

      // Many failures: should cap at 10000ms
      svc.rateLimitState.consecutiveFailures = 10;
      const delay = svc.getBackoffDelay();
      expect(delay).toBeLessThanOrEqual(10000);
    });
  });

  describe("error sanitization", () => {
    it("should remove email addresses from error messages", async () => {
      // Mock the template read to succeed, but sendEmail to fail with an email in the message
      mockReadFile.mockResolvedValue("<mjml>template</mjml>" as any);
      mockSendEmail.mockResolvedValue({
        error: {
          name: "SendError",
          message: "Failed to deliver to user@secret.com",
        },
      } as any);

      const service = NotificationService.getInstance();

      await expect(
        service.sendEmailWithTemplate("to@test.com", "Subject", "template.mjml", {}),
      ).rejects.toThrow(/\[redacted\]/);
    });

    it("should preserve non-email error content", async () => {
      mockReadFile.mockResolvedValue("<mjml>template</mjml>" as any);
      mockSendEmail.mockResolvedValue({
        error: {
          name: "RateLimit",
          message: "Too many requests, retry later",
        },
      } as any);

      const service = NotificationService.getInstance();

      await expect(
        service.sendEmailWithTemplate("to@test.com", "Subject", "template.mjml", {}),
      ).rejects.toThrow("Too many requests, retry later");
    });
  });
});
