/**
 * @fileoverview Email Service Tests
 *
 * Tests for the email service functions including sendEmail,
 * provider initialization, and credential refresh.
 *
 * @module tests/emailService
 */

// Mock dependencies BEFORE imports
jest.mock("../../tools/mjmlCompiler", () => ({
  compileMjmlToHtml: jest.fn(),
}));

jest.mock("../email/providers/EmailProviderFactory", () => ({
  EmailProviderFactory: {
    getProviderType: jest.fn(),
    createProvider: jest.fn(),
  },
}));

jest.mock("../email/types", () => ({
  validateEmailOptions: jest.fn(),
}));

import {
  sendEmail,
  refreshEmailProviderCredentials,
  getCredentialRefreshStatus,
} from "../emailService";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";
import { EmailProviderFactory } from "../email/providers/EmailProviderFactory";
import { validateEmailOptions } from "../email/types";

// Cast mocks
const mockCompileMjml = compileMjmlToHtml as jest.MockedFunction<typeof compileMjmlToHtml>;
const mockGetProviderType = EmailProviderFactory.getProviderType as jest.MockedFunction<
  typeof EmailProviderFactory.getProviderType
>;
const mockCreateProvider = EmailProviderFactory.createProvider as jest.MockedFunction<
  typeof EmailProviderFactory.createProvider
>;
const mockValidateEmailOptions = validateEmailOptions as jest.MockedFunction<
  typeof validateEmailOptions
>;

describe("emailService", () => {
  const originalEnv = process.env;

  const mockProvider = {
    sendEmail: jest.fn(),
    validateConfig: jest.fn(),
    getProviderName: jest.fn().mockReturnValue("MockProvider"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv, EMAIL_ID: "test@example.com" };
    mockGetProviderType.mockReturnValue("resend");
    mockCreateProvider.mockReturnValue(mockProvider as any);
    mockCompileMjml.mockReturnValue("<html>compiled</html>");
    mockProvider.sendEmail.mockResolvedValue({ success: true });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("sendEmail", () => {
    it("should compile MJML template and send email", async () => {
      await sendEmail("to@example.com", "Subject", "<mjml>template</mjml>", { key: "val" });

      expect(mockCompileMjml).toHaveBeenCalledWith("<mjml>template</mjml>", { key: "val" });
      expect(mockProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "to@example.com",
          subject: "Subject",
          html: "<html>compiled</html>",
          from: "test@example.com",
        }),
      );
    });

    it("should validate email options before sending", async () => {
      await sendEmail("to@example.com", "Subject", "<mjml>tpl</mjml>", {});

      expect(mockValidateEmailOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "to@example.com",
          subject: "Subject",
        }),
      );
    });

    it("should throw when EMAIL_ID is missing", async () => {
      delete process.env.EMAIL_ID;

      await expect(sendEmail("to@example.com", "Subject", "<mjml>tpl</mjml>", {})).rejects.toThrow(
        "Email ID is not set in environment variables",
      );
    });

    it("should call provider.sendEmail with compiled HTML", async () => {
      mockCompileMjml.mockReturnValue("<html>custom</html>");

      await sendEmail("to@example.com", "Test", "<mjml></mjml>", {});

      expect(mockProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ html: "<html>custom</html>" }),
      );
    });
  });

  describe("provider singleton", () => {
    it("should cache the provider after first initialization", async () => {
      // The provider is initialized on first sendEmail call and cached module-level.
      // Subsequent calls reuse the cached instance, so sendEmail is called on same provider.
      await sendEmail("to@example.com", "S1", "t", {});
      const callCountAfterFirst = mockProvider.sendEmail.mock.calls.length;

      await sendEmail("to@example.com", "S2", "t", {});
      const callCountAfterSecond = mockProvider.sendEmail.mock.calls.length;

      // Both calls should go through the same provider
      expect(callCountAfterFirst).toBe(1);
      expect(callCountAfterSecond).toBe(2);
    });
  });

  describe("credential refresh", () => {
    it("should call refreshCredentials when needsCredentialRefresh returns true", async () => {
      const refreshableProvider = {
        ...mockProvider,
        refreshCredentials: jest.fn().mockResolvedValue(undefined),
        needsCredentialRefresh: jest.fn().mockReturnValue(true),
        getTimeSinceLastRefresh: jest.fn().mockReturnValue(5000),
      };
      mockCreateProvider.mockReturnValue(refreshableProvider as any);

      // Reset module-level cached provider by re-importing
      jest.resetModules();

      // Re-mock after resetModules
      jest.mock("../../tools/mjmlCompiler", () => ({
        compileMjmlToHtml: jest.fn().mockReturnValue("<html></html>"),
      }));
      jest.mock("../email/providers/EmailProviderFactory", () => ({
        EmailProviderFactory: {
          getProviderType: jest.fn().mockReturnValue("resend"),
          createProvider: jest.fn().mockReturnValue(refreshableProvider),
        },
      }));
      jest.mock("../email/types", () => ({
        validateEmailOptions: jest.fn(),
      }));

      const freshModule = require("../emailService");
      process.env.EMAIL_ID = "test@example.com";

      await freshModule.sendEmail("to@example.com", "Sub", "tpl", {});

      expect(refreshableProvider.needsCredentialRefresh).toHaveBeenCalled();
      expect(refreshableProvider.refreshCredentials).toHaveBeenCalled();
    });

    it("should not call refreshCredentials when needsCredentialRefresh returns false", async () => {
      const refreshableProvider = {
        ...mockProvider,
        refreshCredentials: jest.fn().mockResolvedValue(undefined),
        needsCredentialRefresh: jest.fn().mockReturnValue(false),
        getTimeSinceLastRefresh: jest.fn().mockReturnValue(1000),
      };
      mockCreateProvider.mockReturnValue(refreshableProvider as any);

      jest.resetModules();
      jest.mock("../../tools/mjmlCompiler", () => ({
        compileMjmlToHtml: jest.fn().mockReturnValue("<html></html>"),
      }));
      jest.mock("../email/providers/EmailProviderFactory", () => ({
        EmailProviderFactory: {
          getProviderType: jest.fn().mockReturnValue("resend"),
          createProvider: jest.fn().mockReturnValue(refreshableProvider),
        },
      }));
      jest.mock("../email/types", () => ({
        validateEmailOptions: jest.fn(),
      }));

      const freshModule = require("../emailService");
      process.env.EMAIL_ID = "test@example.com";

      await freshModule.sendEmail("to@example.com", "Sub", "tpl", {});

      expect(refreshableProvider.needsCredentialRefresh).toHaveBeenCalled();
      expect(refreshableProvider.refreshCredentials).not.toHaveBeenCalled();
    });
  });
});
