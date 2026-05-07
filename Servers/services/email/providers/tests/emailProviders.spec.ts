/**
 * @fileoverview Email Provider Classes Tests
 *
 * Tests for ResendProvider, SMTPProvider, ExchangeOnlineProvider,
 * OnPremisesExchangeProvider, AmazonSESProvider, AzureCommunicationServicesProvider.
 *
 * @module tests/emailProviders
 */

// Mock external SDKs
const mockResendSend = jest.fn();
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}));

const mockSendMail = jest.fn();
const mockVerify = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: mockSendMail,
    verify: mockVerify,
  }),
}));

jest.mock("@aws-sdk/client-ses", () => ({
  SESClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  SendEmailCommand: jest.fn(),
  GetSendQuotaCommand: jest.fn(),
}));

jest.mock("@smithy/node-http-handler", () => ({
  NodeHttpHandler: jest.fn(),
}));

jest.mock("@azure/communication-email", () => ({
  EmailClient: jest.fn().mockImplementation(() => ({
    beginSend: jest.fn(),
  })),
}));

import { ResendProvider } from "../ResendProvider";
import { SMTPProvider } from "../SMTPProvider";
import { ExchangeOnlineProvider } from "../ExchangeOnlineProvider";
import { OnPremisesExchangeProvider } from "../OnPremisesExchangeProvider";
import { AmazonSESProvider } from "../AmazonSESProvider";
import { AzureCommunicationServicesProvider } from "../AzureCommunicationServicesProvider";

describe("Email Providers", () => {
  const emailOptions = {
    to: "user@test.com",
    subject: "Test",
    html: "<p>Hello</p>",
  };

  describe("ResendProvider", () => {
    it("should return provider name", () => {
      const provider = new ResendProvider("re_test_key");
      expect(provider.getProviderName()).toBe("Resend");
    });

    it("should validate config when API key exists", async () => {
      const provider = new ResendProvider("re_test_key");
      const result = await provider.validateConfig();
      expect(result).toBe(true);
    });

    it("should send email successfully", async () => {
      mockResendSend.mockResolvedValue({ data: { id: "msg-1" }, error: null });

      const provider = new ResendProvider("re_test_key");
      const result = await provider.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg-1");
    });

    it("should handle Resend API error", async () => {
      mockResendSend.mockResolvedValue({
        data: null,
        error: { name: "RateLimit", message: "Too many requests" },
      });

      const provider = new ResendProvider("re_test_key");
      const result = await provider.sendEmail(emailOptions);

      expect(result.success).toBe(false);
      expect(result.error!.name).toBe("RateLimit");
    });

    it("should handle send exception", async () => {
      mockResendSend.mockRejectedValue(new Error("Network error"));

      const provider = new ResendProvider("re_test_key");

      const result = await provider.sendEmail(emailOptions);

      expect(result.success).toBe(false);
      expect(result.error!.message).toBe("Network error");
    });
  });

  describe("SMTPProvider", () => {
    const smtpConfig = {
      host: "smtp.test.com",
      port: 587,
      secure: false,
      auth: { user: "user", pass: "pass" },
    };

    it("should return provider name", () => {
      const provider = new SMTPProvider(smtpConfig);
      expect(provider.getProviderName()).toBe("SMTP");
    });

    it("should validate config via transporter verify", async () => {
      mockVerify.mockResolvedValue(true);

      const provider = new SMTPProvider(smtpConfig);
      const result = await provider.validateConfig();
      expect(result).toBe(true);
    });

    it("should return false on validation failure", async () => {
      mockVerify.mockRejectedValue(new Error("Auth failed"));

      const provider = new SMTPProvider(smtpConfig);
      const result = await provider.validateConfig();
      expect(result).toBe(false);
    });

    it("should send email and return messageId", async () => {
      mockSendMail.mockResolvedValue({ messageId: "smtp-msg-1" });

      const provider = new SMTPProvider(smtpConfig);
      const result = await provider.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("smtp-msg-1");
    });

    it("should handle send failure", async () => {
      mockSendMail.mockRejectedValue(new Error("Connection refused"));

      const provider = new SMTPProvider(smtpConfig);

      const result = await provider.sendEmail(emailOptions);

      expect(result.success).toBe(false);
      expect(result.error!.message).toBe("Connection refused");
    });
  });

  describe("ExchangeOnlineProvider", () => {
    const config = { user: "user@office365.com", pass: "pass" };

    it("should return provider name", () => {
      const provider = new ExchangeOnlineProvider(config);
      expect(provider.getProviderName()).toBe("Exchange Online (Office 365)");
    });

    it("should send email successfully", async () => {
      mockSendMail.mockResolvedValue({ messageId: "exo-msg-1" });

      const provider = new ExchangeOnlineProvider(config);

      const result = await provider.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("exo-msg-1");
    });
  });

  describe("OnPremisesExchangeProvider", () => {
    const config = {
      host: "exchange.local",
      port: 587,
      secure: false,
      auth: { user: "user", pass: "pass" },
    };

    it("should return provider name with host", () => {
      const provider = new OnPremisesExchangeProvider(config);
      expect(provider.getProviderName()).toBe("On-Premises Exchange (exchange.local)");
    });

    it("should send email successfully", async () => {
      mockSendMail.mockResolvedValue({ messageId: "onprem-msg-1" });

      const provider = new OnPremisesExchangeProvider(config);

      const result = await provider.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("onprem-msg-1");
    });
  });

  describe("AmazonSESProvider", () => {
    const config = {
      region: "us-east-1",
      accessKeyId: "AKIATEST",
      secretAccessKey: "secret",
    };

    it("should return provider name with region", () => {
      const provider = new AmazonSESProvider(config);
      expect(provider.getProviderName()).toBe("Amazon SES (us-east-1)");
    });

    it("should report needs credential refresh based on interval", () => {
      const provider = new AmazonSESProvider(config);
      // Just created, should not need refresh
      expect(provider.needsCredentialRefresh()).toBe(false);
    });

    it("should track time since last refresh", () => {
      const provider = new AmazonSESProvider(config);
      const timeSince = provider.getTimeSinceLastRefresh();
      expect(timeSince).toBeGreaterThanOrEqual(0);
      expect(timeSince).toBeLessThan(1000); // should be very recent
    });
  });

  describe("AzureCommunicationServicesProvider", () => {
    const connectionString = "endpoint=https://test.com;key=abc123";

    it("should return provider name", () => {
      const provider = new AzureCommunicationServicesProvider(connectionString);
      expect(provider.getProviderName()).toBe("Azure Communication Services");
    });

    it("should validate config with valid connection string", async () => {
      const provider = new AzureCommunicationServicesProvider(connectionString);
      const result = await provider.validateConfig();
      expect(result).toBe(true);
    });

    it("should reject invalid connection string", async () => {
      const provider = new AzureCommunicationServicesProvider("invalid");
      const result = await provider.validateConfig();
      expect(result).toBe(false);
    });

    it("should reject empty connection string", async () => {
      const provider = new AzureCommunicationServicesProvider("");
      const result = await provider.validateConfig();
      expect(result).toBe(false);
    });
  });
});
