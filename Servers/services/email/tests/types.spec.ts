/**
 * @fileoverview Email Types Tests
 *
 * Tests for email validation functions and constants.
 *
 * @module tests/types
 */

import { validateEmailOptions, EmailOptions } from "../types";

describe("email/types", () => {
  describe("validateEmailOptions", () => {
    const validOptions: EmailOptions = {
      to: "user@example.com",
      subject: "Test Subject",
      html: "<p>Hello</p>",
    };

    it("should not throw for valid options", () => {
      expect(() => validateEmailOptions(validOptions)).not.toThrow();
    });

    it("should throw for missing to address", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should throw for invalid to email format", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "not-an-email" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should throw for invalid from email format", () => {
      expect(() => validateEmailOptions({ ...validOptions, from: "bad-email" })).toThrow(
        "Invalid sender email address",
      );
    });

    it("should throw for missing subject", () => {
      expect(() => validateEmailOptions({ ...validOptions, subject: "" })).toThrow(
        "Subject is required",
      );
    });

    it("should throw for subject too long", () => {
      expect(() => validateEmailOptions({ ...validOptions, subject: "x".repeat(999) })).toThrow(
        "Subject too long",
      );
    });

    it("should reject email with newline in to address", () => {
      expect(() =>
        validateEmailOptions({ ...validOptions, to: "user@example.com\nBcc: evil@example.com" }),
      ).toThrow("Invalid recipient email address");
    });

    it("should reject email with newline in from address", () => {
      expect(() =>
        validateEmailOptions({
          ...validOptions,
          from: "user@example.com\r\nBcc: evil@example.com",
        }),
      ).toThrow("Invalid sender email address");
    });

    it("should throw for newline in subject (header injection)", () => {
      expect(() =>
        validateEmailOptions({ ...validOptions, subject: "Hello\nX-Header: bad" }),
      ).toThrow("Email header injection detected");
    });

    it("should throw for missing html content", () => {
      expect(() => validateEmailOptions({ ...validOptions, html: "" })).toThrow(
        "Email content is required",
      );
    });

    it("should throw for html content too large", () => {
      expect(() => validateEmailOptions({ ...validOptions, html: "x".repeat(1000001) })).toThrow(
        "Email content too large",
      );
    });

    it("should accept valid from address", () => {
      expect(() =>
        validateEmailOptions({ ...validOptions, from: "sender@company.org" }),
      ).not.toThrow();
    });

    it("should reject email with consecutive dots in local part", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user..name@example.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with leading dot in local part", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: ".user@example.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with trailing dot in local part", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user.@example.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with consecutive dots in domain", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user@exam..ple.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with dangerous HTML characters", () => {
      expect(() =>
        validateEmailOptions({ ...validOptions, to: "user<script>@example.com" }),
      ).toThrow("Invalid recipient email address");
    });

    it("should reject email with unicode characters", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user@exämple.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with javascript: scheme", () => {
      expect(() =>
        validateEmailOptions({ ...validOptions, to: "javascript:alert(1)@example.com" }),
      ).toThrow("Invalid recipient email address");
    });

    it("should reject email with URL-encoded characters", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user%40example.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with HTML entities", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user&#64;example.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with invalid TLD", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user@example.c" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with domain label starting with hyphen", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user@-example.com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should reject email with empty domain label", () => {
      expect(() => validateEmailOptions({ ...validOptions, to: "user@example..com" })).toThrow(
        "Invalid recipient email address",
      );
    });

    it("should accept email with valid plus addressing", () => {
      expect(() =>
        validateEmailOptions({ ...validOptions, to: "user+tag@example.com" }),
      ).not.toThrow();
    });

    it("should accept email with valid subdomain", () => {
      expect(() =>
        validateEmailOptions({ ...validOptions, to: "user@mail.example.co.uk" }),
      ).not.toThrow();
    });

    it("should reject local part longer than 64 characters", () => {
      expect(() =>
        validateEmailOptions({
          ...validOptions,
          to: `${"a".repeat(65)}@example.com`,
        }),
      ).toThrow("Invalid recipient email address");
    });

    it("should reject email longer than 320 characters", () => {
      expect(() =>
        validateEmailOptions({
          ...validOptions,
          to: `${"a".repeat(300)}@example.com`,
        }),
      ).toThrow("Invalid recipient email address");
    });
  });
});
