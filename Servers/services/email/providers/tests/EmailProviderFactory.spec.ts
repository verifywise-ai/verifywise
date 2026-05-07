/**
 * @fileoverview EmailProviderFactory Tests
 *
 * Tests for the EmailProviderFactory class including provider creation,
 * provider type resolution, and missing env var validation.
 *
 * @module tests/EmailProviderFactory
 */

// Mock all provider classes BEFORE imports
jest.mock("../ResendProvider", () => ({
  ResendProvider: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn(),
    validateConfig: jest.fn(),
    getProviderName: jest.fn().mockReturnValue("Resend"),
  })),
}));

jest.mock("../SMTPProvider", () => ({
  SMTPProvider: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn(),
    validateConfig: jest.fn(),
    getProviderName: jest.fn().mockReturnValue("SMTP"),
  })),
}));

jest.mock("../ExchangeOnlineProvider", () => ({
  ExchangeOnlineProvider: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn(),
    validateConfig: jest.fn(),
    getProviderName: jest.fn().mockReturnValue("ExchangeOnline"),
  })),
}));

jest.mock("../OnPremisesExchangeProvider", () => ({
  OnPremisesExchangeProvider: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn(),
    validateConfig: jest.fn(),
    getProviderName: jest.fn().mockReturnValue("OnPremisesExchange"),
  })),
}));

jest.mock("../AmazonSESProvider", () => ({
  AmazonSESProvider: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn(),
    validateConfig: jest.fn(),
    getProviderName: jest.fn().mockReturnValue("AmazonSES"),
  })),
}));

jest.mock("../AzureCommunicationServicesProvider", () => ({
  AzureCommunicationServicesProvider: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn(),
    validateConfig: jest.fn(),
    getProviderName: jest.fn().mockReturnValue("AzureCommunicationServices"),
  })),
}));

import { EmailProviderFactory } from "../EmailProviderFactory";

describe("EmailProviderFactory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("createProvider", () => {
    it("should create a ResendProvider for 'resend' type", () => {
      process.env.RESEND_API_KEY = "re_test_123";

      const provider = EmailProviderFactory.createProvider("resend");

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe("Resend");
    });

    it("should create an SMTPProvider for 'smtp' type", () => {
      process.env.SMTP_HOST = "smtp.test.com";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "user";
      process.env.SMTP_PASS = "pass";

      const provider = EmailProviderFactory.createProvider("smtp");

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe("SMTP");
    });

    it("should create an ExchangeOnlineProvider for 'exchange-online' type", () => {
      process.env.EXCHANGE_ONLINE_USER = "user@test.com";
      process.env.EXCHANGE_ONLINE_PASS = "pass";

      const provider = EmailProviderFactory.createProvider("exchange-online");

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe("ExchangeOnline");
    });

    it("should create an OnPremisesExchangeProvider for 'exchange-onprem' type", () => {
      process.env.EXCHANGE_ONPREM_HOST = "exchange.local";
      process.env.EXCHANGE_ONPREM_PORT = "587";
      process.env.EXCHANGE_ONPREM_USER = "user";
      process.env.EXCHANGE_ONPREM_PASS = "pass";

      const provider = EmailProviderFactory.createProvider("exchange-onprem");

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe("OnPremisesExchange");
    });

    it("should create an AmazonSESProvider for 'amazon-ses' type", () => {
      process.env.AWS_SES_REGION = "us-east-1";
      process.env.AWS_SES_ACCESS_KEY_ID = "AKIATEST";
      process.env.AWS_SES_SECRET_ACCESS_KEY = "secret";

      const provider = EmailProviderFactory.createProvider("amazon-ses");

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe("AmazonSES");
    });

    it("should create an AzureCommunicationServicesProvider for 'azure-communication-services' type", () => {
      process.env.AZURE_COMMUNICATION_CONNECTION_STRING = "endpoint=https://test.com;key=abc";

      const provider = EmailProviderFactory.createProvider("azure-communication-services");

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe("AzureCommunicationServices");
    });

    it("should throw for unsupported provider type", () => {
      expect(() => EmailProviderFactory.createProvider("unsupported" as any)).toThrow(
        "Unsupported email provider: unsupported",
      );
    });
  });

  describe("getProviderType", () => {
    it("should return the EMAIL_PROVIDER env value when valid", () => {
      process.env.EMAIL_PROVIDER = "smtp";

      const result = EmailProviderFactory.getProviderType();

      expect(result).toBe("smtp");
    });

    it("should default to 'resend' when EMAIL_PROVIDER is missing", () => {
      delete process.env.EMAIL_PROVIDER;

      const result = EmailProviderFactory.getProviderType();

      expect(result).toBe("resend");
    });

    it("should default to 'resend' when EMAIL_PROVIDER is invalid", () => {
      process.env.EMAIL_PROVIDER = "invalid-provider";

      const result = EmailProviderFactory.getProviderType();

      expect(result).toBe("resend");
    });
  });

  describe("provider factory methods throw when required env vars missing", () => {
    it("should throw when RESEND_API_KEY is missing for resend provider", () => {
      delete process.env.RESEND_API_KEY;

      expect(() => EmailProviderFactory.createProvider("resend")).toThrow(
        "RESEND_API_KEY environment variable is required",
      );
    });

    it("should throw when SMTP env vars are incomplete", () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      expect(() => EmailProviderFactory.createProvider("smtp")).toThrow(
        "SMTP configuration incomplete",
      );
    });

    it("should throw when Exchange Online env vars are missing", () => {
      delete process.env.EXCHANGE_ONLINE_USER;
      delete process.env.EXCHANGE_ONLINE_PASS;

      expect(() => EmailProviderFactory.createProvider("exchange-online")).toThrow(
        "Exchange Online configuration incomplete",
      );
    });

    it("should throw when On-Premises Exchange env vars are missing", () => {
      delete process.env.EXCHANGE_ONPREM_HOST;
      delete process.env.EXCHANGE_ONPREM_PORT;
      delete process.env.EXCHANGE_ONPREM_USER;
      delete process.env.EXCHANGE_ONPREM_PASS;

      expect(() => EmailProviderFactory.createProvider("exchange-onprem")).toThrow(
        "On-Premises Exchange configuration incomplete",
      );
    });

    it("should throw when Amazon SES env vars are missing", () => {
      delete process.env.AWS_SES_REGION;
      delete process.env.AWS_SES_ACCESS_KEY_ID;
      delete process.env.AWS_SES_SECRET_ACCESS_KEY;

      expect(() => EmailProviderFactory.createProvider("amazon-ses")).toThrow(
        "Amazon SES configuration incomplete",
      );
    });

    it("should throw when Azure Communication Services env vars are missing", () => {
      delete process.env.AZURE_COMMUNICATION_CONNECTION_STRING;

      expect(() => EmailProviderFactory.createProvider("azure-communication-services")).toThrow(
        "Azure Communication Services configuration incomplete",
      );
    });
  });
});
